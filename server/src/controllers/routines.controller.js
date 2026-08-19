// Workout routines: a named program owned by one user, containing an ordered
// list of exercises with prescribed targets (sets, rep range, rest seconds),
// and optionally scheduled onto weekdays (0 = Sunday ... 6 = Saturday).
//
// Writes touching two tables run inside a transaction so a failed insert can
// never leave a half-saved routine or schedule.
const pool = require('../config/db');
const { findInvisibleExercises } = require('../services/exercise.service');

const MAX_EXERCISES = 50;

// ---------------------------------------------------------------------------
// Validates the create/update payload. Returns { error } on the first
// problem, otherwise the normalized { name, description, exercises }.
function validateRoutineBody(body) {
  const { name, description, exercises } = body || {};

  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    return { error: 'Name must be 2-100 characters' };
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return { error: 'Description must be a string' };
  }
  if (!Array.isArray(exercises) || exercises.length < 1 || exercises.length > MAX_EXERCISES) {
    return { error: `Exercises must be an array of 1-${MAX_EXERCISES} items` };
  }

  const normalized = [];
  for (let i = 0; i < exercises.length; i++) {
    const item = exercises[i] || {};
    const exerciseId = Number(item.exercise_id);
    const sets = Number(item.target_sets);
    const repsMin = Number(item.target_reps_min);
    const repsMax = Number(item.target_reps_max);
    const rest =
      item.rest_seconds === undefined || item.rest_seconds === null
        ? null
        : Number(item.rest_seconds);

    if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
      return { error: `Exercise #${i + 1}: exercise_id must be a positive integer` };
    }
    if (!Number.isInteger(sets) || sets < 1 || sets > 20) {
      return { error: `Exercise #${i + 1}: target_sets must be 1-20` };
    }
    if (
      !Number.isInteger(repsMin) || repsMin < 1 || repsMin > 100 ||
      !Number.isInteger(repsMax) || repsMax < 1 || repsMax > 100
    ) {
      return { error: `Exercise #${i + 1}: rep targets must be integers 1-100` };
    }
    if (repsMin > repsMax) {
      return { error: `Exercise #${i + 1}: target_reps_min cannot exceed target_reps_max` };
    }
    if (rest !== null && (!Number.isInteger(rest) || rest < 0 || rest > 3600)) {
      return { error: `Exercise #${i + 1}: rest_seconds must be an integer 0-3600` };
    }

    normalized.push({ exerciseId, sets, repsMin, repsMax, rest, orderIndex: i });
  }

  return {
    name: name.trim(),
    description: description ? String(description).trim() : null,
    exercises: normalized,
  };
}

async function fetchRoutineDetail(routineId, userId) {
  const [routines] = await pool.execute(
    `SELECT id, name, description, created_at
     FROM routines WHERE id = :id AND user_id = :userId`,
    { id: routineId, userId }
  );
  if (!routines[0]) return null;

  const [exercises] = await pool.execute(
    `SELECT re.exercise_id, e.name, e.muscle_group, e.category,
            re.order_index, re.target_sets, re.target_reps_min,
            re.target_reps_max, re.rest_seconds
     FROM routine_exercises re
     JOIN exercises e ON e.id = re.exercise_id
     WHERE re.routine_id = :id
     ORDER BY re.order_index`,
    { id: routineId }
  );

  const [days] = await pool.execute(
    'SELECT day_of_week FROM routine_schedules WHERE routine_id = :id ORDER BY day_of_week',
    { id: routineId }
  );

  return {
    ...routines[0],
    exercises,
    scheduled_days: days.map((d) => d.day_of_week),
  };
}

// GET /api/routines - summary list with exercise counts and scheduled days
async function listRoutines(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT r.id, r.name, r.description, r.created_at,
              COUNT(DISTINCT re.id) AS exercise_count,
              GROUP_CONCAT(DISTINCT rs.day_of_week ORDER BY rs.day_of_week) AS scheduled_days
       FROM routines r
       LEFT JOIN routine_exercises re ON re.routine_id = r.id
       LEFT JOIN routine_schedules rs ON rs.routine_id = r.id
       WHERE r.user_id = :userId
       GROUP BY r.id
       ORDER BY r.created_at DESC, r.id DESC`,
      { userId: req.user.id }
    );

    const routines = rows.map((r) => ({
      ...r,
      scheduled_days: r.scheduled_days ? r.scheduled_days.split(',').map(Number) : [],
    }));
    return res.json({ routines });
  } catch (err) {
    return next(err);
  }
}

// GET /api/routines/schedule - the full week (all 7 days, empty or not),
// ready for the frontend's weekly view.
async function getWeeklySchedule(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT rs.day_of_week, r.id, r.name
       FROM routine_schedules rs
       JOIN routines r ON r.id = rs.routine_id
       WHERE r.user_id = :userId
       ORDER BY rs.day_of_week, r.name`,
      { userId: req.user.id }
    );

    const week = Array.from({ length: 7 }, (_, day) => ({
      day_of_week: day,
      routines: [],
    }));
    for (const row of rows) {
      week[row.day_of_week].routines.push({ id: row.id, name: row.name });
    }
    return res.json({ week });
  } catch (err) {
    return next(err);
  }
}

// GET /api/routines/:id - full detail with ordered exercises and targets
async function getRoutine(req, res, next) {
  const routineId = Number(req.params.id);
  if (!Number.isInteger(routineId) || routineId <= 0) {
    return res.status(400).json({ error: 'Invalid routine id' });
  }
  try {
    const detail = await fetchRoutineDetail(routineId, req.user.id);
    if (!detail) return res.status(404).json({ error: 'Routine not found' });
    return res.json({ routine: detail });
  } catch (err) {
    return next(err);
  }
}

// POST /api/routines  { name, description?, exercises: [...] }
async function createRoutine(req, res, next) {
  const parsed = validateRoutineBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    const invisible = await findInvisibleExercises(
      parsed.exercises.map((e) => e.exerciseId),
      req.user.id
    );
    if (invisible.length > 0) {
      return res.status(400).json({ error: `Unknown exercise ids: ${invisible.join(', ')}` });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.execute(
        'INSERT INTO routines (user_id, name, description) VALUES (:userId, :name, :description)',
        { userId: req.user.id, name: parsed.name, description: parsed.description }
      );
      const routineId = result.insertId;

      for (const ex of parsed.exercises) {
        await conn.execute(
          `INSERT INTO routine_exercises
             (routine_id, exercise_id, order_index, target_sets,
              target_reps_min, target_reps_max, rest_seconds)
           VALUES (:routineId, :exerciseId, :orderIndex, :sets, :repsMin, :repsMax, :rest)`,
          {
            routineId,
            exerciseId: ex.exerciseId,
            orderIndex: ex.orderIndex,
            sets: ex.sets,
            repsMin: ex.repsMin,
            repsMax: ex.repsMax,
            rest: ex.rest,
          }
        );
      }

      await conn.commit();
      const detail = await fetchRoutineDetail(routineId, req.user.id);
      return res.status(201).json({ routine: detail });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    return next(err);
  }
}

// PUT /api/routines/:id - updates the metadata and REPLACES the exercise
// list. Replace-all is the simplest correct way to apply reordering,
// removals, and target changes in a single atomic operation.
async function updateRoutine(req, res, next) {
  const routineId = Number(req.params.id);
  if (!Number.isInteger(routineId) || routineId <= 0) {
    return res.status(400).json({ error: 'Invalid routine id' });
  }
  const parsed = validateRoutineBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    const [owned] = await pool.execute(
      'SELECT id FROM routines WHERE id = :id AND user_id = :userId',
      { id: routineId, userId: req.user.id }
    );
    if (!owned[0]) return res.status(404).json({ error: 'Routine not found' });

    const invisible = await findInvisibleExercises(
      parsed.exercises.map((e) => e.exerciseId),
      req.user.id
    );
    if (invisible.length > 0) {
      return res.status(400).json({ error: `Unknown exercise ids: ${invisible.join(', ')}` });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        'UPDATE routines SET name = :name, description = :description WHERE id = :id',
        { name: parsed.name, description: parsed.description, id: routineId }
      );
      await conn.execute('DELETE FROM routine_exercises WHERE routine_id = :id', {
        id: routineId,
      });

      for (const ex of parsed.exercises) {
        await conn.execute(
          `INSERT INTO routine_exercises
             (routine_id, exercise_id, order_index, target_sets,
              target_reps_min, target_reps_max, rest_seconds)
           VALUES (:routineId, :exerciseId, :orderIndex, :sets, :repsMin, :repsMax, :rest)`,
          {
            routineId,
            exerciseId: ex.exerciseId,
            orderIndex: ex.orderIndex,
            sets: ex.sets,
            repsMin: ex.repsMin,
            repsMax: ex.repsMax,
            rest: ex.rest,
          }
        );
      }

      await conn.commit();
      const detail = await fetchRoutineDetail(routineId, req.user.id);
      return res.json({ routine: detail });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    return next(err);
  }
}

// PUT /api/routines/:id/schedule  { days: [0..6] }
// Replace-all semantics: the given set becomes the routine's schedule;
// an empty array simply unschedules it. Duplicates are collapsed.
async function setSchedule(req, res, next) {
  const routineId = Number(req.params.id);
  if (!Number.isInteger(routineId) || routineId <= 0) {
    return res.status(400).json({ error: 'Invalid routine id' });
  }

  const { days } = req.body || {};
  if (!Array.isArray(days)) {
    return res.status(400).json({
      error: 'days must be an array of weekday numbers (0 = Sunday ... 6 = Saturday)',
    });
  }
  const unique = [...new Set(days.map(Number))].sort((a, b) => a - b);
  if (unique.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return res.status(400).json({ error: 'Each day must be an integer 0-6 (0 = Sunday)' });
  }

  try {
    const [owned] = await pool.execute(
      'SELECT id FROM routines WHERE id = :id AND user_id = :userId',
      { id: routineId, userId: req.user.id }
    );
    if (!owned[0]) return res.status(404).json({ error: 'Routine not found' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute('DELETE FROM routine_schedules WHERE routine_id = :id', {
        id: routineId,
      });
      for (const day of unique) {
        await conn.execute(
          'INSERT INTO routine_schedules (routine_id, day_of_week) VALUES (:id, :day)',
          { id: routineId, day }
        );
      }

      await conn.commit();
      return res.json({ routine_id: routineId, days: unique });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/routines/:id
// CASCADE removes the routine's targets and schedules; logged workout
// history survives because workout_sessions.routine_id is ON DELETE SET NULL.
async function deleteRoutine(req, res, next) {
  const routineId = Number(req.params.id);
  if (!Number.isInteger(routineId) || routineId <= 0) {
    return res.status(400).json({ error: 'Invalid routine id' });
  }
  try {
    const [result] = await pool.execute(
      'DELETE FROM routines WHERE id = :id AND user_id = :userId',
      { id: routineId, userId: req.user.id }
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Routine not found' });
    }
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listRoutines,
  getRoutine,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  setSchedule,
  getWeeklySchedule,
};
