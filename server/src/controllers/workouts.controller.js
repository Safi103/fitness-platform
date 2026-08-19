// Workout sessions: the heart of the app.
//
// Design decision: the CLIENT owns the in-progress workout (live set entry,
// rest timers, notes) and the API persists the ENTIRE payload atomically
// when the user presses "Finish Workout" - one transaction across
// workout_sessions, session_exercises and workout_sets. Personal-record
// detection runs inside that same transaction, and the response reports any
// new records so the client can notify the user immediately.
const pool = require('../config/db');
const { findInvisibleExercises } = require('../services/exercise.service');
const { detectAndUpdateRecords } = require('../services/pr.service');

const MAX_EXERCISES = 50;
const MAX_SETS = 50;

// ---------------------------------------------------------------------------
// Validates the workout payload. Returns { error } on the first problem,
// otherwise the normalized { routineId, startedAt, exercises }.
function validateWorkoutBody(body) {
  const { routine_id, started_at, exercises } = body || {};

  let routineId = null;
  if (routine_id !== undefined && routine_id !== null) {
    routineId = Number(routine_id);
    if (!Number.isInteger(routineId) || routineId <= 0) {
      return { error: 'routine_id must be a positive integer' };
    }
  }

  // started_at is when the user pressed Start on the client; the server
  // stamps completed_at itself at save time. Small clock skew is tolerated.
  let startedAt = null;
  if (started_at !== undefined && started_at !== null) {
    startedAt = new Date(started_at);
    if (Number.isNaN(startedAt.getTime())) {
      return { error: 'started_at must be a valid date string' };
    }
    if (startedAt.getTime() > Date.now() + 2 * 60 * 1000) {
      return { error: 'started_at cannot be in the future' };
    }
  }

  if (!Array.isArray(exercises) || exercises.length < 1 || exercises.length > MAX_EXERCISES) {
    return { error: `Exercises must be an array of 1-${MAX_EXERCISES} items` };
  }

  const normalized = [];
  for (let i = 0; i < exercises.length; i++) {
    const item = exercises[i] || {};
    const exerciseId = Number(item.exercise_id);

    if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
      return { error: `Exercise #${i + 1}: exercise_id must be a positive integer` };
    }

    let note = null;
    if (item.note !== undefined && item.note !== null) {
      if (typeof item.note !== 'string' || item.note.length > 1000) {
        return { error: `Exercise #${i + 1}: note must be a string of at most 1000 characters` };
      }
      note = item.note.trim() || null;
    }

    if (!Array.isArray(item.sets) || item.sets.length < 1 || item.sets.length > MAX_SETS) {
      return { error: `Exercise #${i + 1}: sets must be an array of 1-${MAX_SETS} items` };
    }

    const sets = [];
    for (let j = 0; j < item.sets.length; j++) {
      const s = item.sets[j] || {};
      const weight = Number(s.weight);
      const reps = Number(s.reps);
      const partials =
        s.partial_reps === undefined || s.partial_reps === null ? 0 : Number(s.partial_reps);

      if (!Number.isFinite(weight) || weight < 0 || weight > 9999.99) {
        return { error: `Exercise #${i + 1}, set #${j + 1}: weight must be 0-9999.99` };
      }
      if (!Number.isInteger(reps) || reps < 0 || reps > 100) {
        return { error: `Exercise #${i + 1}, set #${j + 1}: reps must be an integer 0-100` };
      }
      if (!Number.isInteger(partials) || partials < 0 || partials > 100) {
        return { error: `Exercise #${i + 1}, set #${j + 1}: partial_reps must be an integer 0-100` };
      }
      // A set of 0 reps and 0 partials records nothing; a failed attempt is
      // still loggable as 0 full reps + N partials.
      if (reps + partials < 1) {
        return { error: `Exercise #${i + 1}, set #${j + 1}: a set needs at least one rep or partial rep` };
      }

      sets.push({ setNumber: j + 1, weight, reps, partials });
    }

    normalized.push({ exerciseId, note, orderIndex: i, sets });
  }

  return { routineId, startedAt, exercises: normalized };
}

async function fetchWorkoutDetail(sessionId, userId) {
  const [sessions] = await pool.execute(
    `SELECT ws.id, ws.routine_id, r.name AS routine_name,
            ws.started_at, ws.completed_at
     FROM workout_sessions ws
     LEFT JOIN routines r ON r.id = ws.routine_id
     WHERE ws.id = :id AND ws.user_id = :userId`,
    { id: sessionId, userId }
  );
  if (!sessions[0]) return null;

  const [exercises] = await pool.execute(
    `SELECT se.id, se.exercise_id, e.name, e.muscle_group, e.category,
            se.order_index, se.note
     FROM session_exercises se
     JOIN exercises e ON e.id = se.exercise_id
     WHERE se.session_id = :id
     ORDER BY se.order_index`,
    { id: sessionId }
  );

  const [sets] = await pool.execute(
    `SELECT st.session_exercise_id, st.set_number, st.weight, st.reps, st.partial_reps
     FROM workout_sets st
     JOIN session_exercises se ON se.id = st.session_exercise_id
     WHERE se.session_id = :id
     ORDER BY st.session_exercise_id, st.set_number`,
    { id: sessionId }
  );

  const bySessionExercise = new Map(exercises.map((e) => [e.id, { ...e, sets: [] }]));
  for (const s of sets) {
    bySessionExercise.get(s.session_exercise_id).sets.push({
      set_number: s.set_number,
      weight: Number(s.weight),
      reps: s.reps,
      partial_reps: s.partial_reps,
    });
  }

  return { ...sessions[0], exercises: [...bySessionExercise.values()] };
}

// POST /api/workouts - save a finished workout in one transaction, then
// report any personal records it produced.
async function createWorkout(req, res, next) {
  const parsed = validateWorkoutBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    if (parsed.routineId !== null) {
      const [owned] = await pool.execute(
        'SELECT id FROM routines WHERE id = :id AND user_id = :userId',
        { id: parsed.routineId, userId: req.user.id }
      );
      if (!owned[0]) {
        return res.status(400).json({ error: `Unknown routine id: ${parsed.routineId}` });
      }
    }

    const invisible = await findInvisibleExercises(
      parsed.exercises.map((e) => e.exerciseId),
      req.user.id
    );
    if (invisible.length > 0) {
      return res.status(400).json({ error: `Unknown exercise ids: ${invisible.join(', ')}` });
    }

    const startedAt = parsed.startedAt || new Date();

    const conn = await pool.getConnection();
    let sessionId;
    let newRecords;
    try {
      await conn.beginTransaction();

      const [result] = await conn.execute(
        `INSERT INTO workout_sessions (user_id, routine_id, started_at, completed_at)
         VALUES (:userId, :routineId, :startedAt, NOW())`,
        { userId: req.user.id, routineId: parsed.routineId, startedAt }
      );
      sessionId = result.insertId;

      const recordInput = [];

      for (const ex of parsed.exercises) {
        const [seResult] = await conn.execute(
          `INSERT INTO session_exercises (session_id, exercise_id, order_index, note)
           VALUES (:sessionId, :exerciseId, :orderIndex, :note)`,
          { sessionId, exerciseId: ex.exerciseId, orderIndex: ex.orderIndex, note: ex.note }
        );
        const sessionExerciseId = seResult.insertId;

        const insertedSets = [];
        for (const s of ex.sets) {
          const [setResult] = await conn.execute(
            `INSERT INTO workout_sets
               (session_exercise_id, set_number, weight, reps, partial_reps)
             VALUES (:sessionExerciseId, :setNumber, :weight, :reps, :partials)`,
            {
              sessionExerciseId,
              setNumber: s.setNumber,
              weight: s.weight,
              reps: s.reps,
              partials: s.partials,
            }
          );
          insertedSets.push({ setId: setResult.insertId, weight: s.weight, reps: s.reps });
        }
        recordInput.push({ exerciseId: ex.exerciseId, sets: insertedSets });
      }

      newRecords = await detectAndUpdateRecords(conn, req.user.id, recordInput);

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    // Read back AFTER the transaction is committed and the connection is
    // released: this is a plain read, and a failure here must not attempt to
    // roll back work that is already durable.
    const detail = await fetchWorkoutDetail(sessionId, req.user.id);
    return res.status(201).json({ workout: detail, new_records: newRecords });
  } catch (err) {
    return next(err);
  }
}

// GET /api/workouts?limit=&offset= - history feed, newest first, with
// per-session aggregates. Volume follows the spec formula (weight x reps,
// summed over sets); partial reps are logged but excluded from volume.
async function listWorkouts(req, res, next) {
  try {
    // limit/offset are clamped integers generated here - never raw strings.
    let limit = Number.parseInt(req.query.limit, 10);
    let offset = Number.parseInt(req.query.offset, 10);
    limit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 20;
    offset = Number.isInteger(offset) && offset > 0 ? offset : 0;

    const [rows] = await pool.execute(
      `SELECT ws.id, ws.routine_id, r.name AS routine_name,
              ws.started_at, ws.completed_at,
              COUNT(DISTINCT se.id) AS exercise_count,
              COUNT(st.id) AS set_count,
              COALESCE(SUM(st.weight * st.reps), 0) AS total_volume
       FROM workout_sessions ws
       LEFT JOIN routines r ON r.id = ws.routine_id
       LEFT JOIN session_exercises se ON se.session_id = ws.id
       LEFT JOIN workout_sets st ON st.session_exercise_id = se.id
       WHERE ws.user_id = :userId
       GROUP BY ws.id
       ORDER BY ws.started_at DESC, ws.id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      { userId: req.user.id }
    );

    const [[{ total }]] = await pool.execute(
      'SELECT COUNT(*) AS total FROM workout_sessions WHERE user_id = :userId',
      { userId: req.user.id }
    );

    const workouts = rows.map((w) => ({ ...w, total_volume: Number(w.total_volume) }));
    return res.json({ workouts, total, limit, offset });
  } catch (err) {
    return next(err);
  }
}

// GET /api/workouts/:id - full detail with exercises, sets, and notes
async function getWorkout(req, res, next) {
  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: 'Invalid workout id' });
  }
  try {
    const detail = await fetchWorkoutDetail(sessionId, req.user.id);
    if (!detail) return res.status(404).json({ error: 'Workout not found' });
    return res.json({ workout: detail });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/workouts/:id
// CASCADE removes the session's exercises and sets. Personal records that
// pointed at a deleted set keep their value: workout_set_id is SET NULL.
async function deleteWorkout(req, res, next) {
  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: 'Invalid workout id' });
  }
  try {
    const [result] = await pool.execute(
      'DELETE FROM workout_sessions WHERE id = :id AND user_id = :userId',
      { id: sessionId, userId: req.user.id }
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Workout not found' });
    }
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { createWorkout, listWorkouts, getWorkout, deleteWorkout };
