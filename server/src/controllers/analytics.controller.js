// Analytics: read-only aggregations that power the charts and dashboard.
// Volume always uses the spec formula - weight x reps summed over sets -
// so numbers here match the history feed exactly. Partial reps are logged
// data but never counted in volume.
const pool = require('../config/db');
const { findInvisibleExercises } = require('../services/exercise.service');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Optional ?from=&to= range filtering. Implemented for the API surface, but
// the dashboard currently charts full history and never sends these, so the
// path is unexercised by the client.
function parseDateRange(query) {
  const { from, to } = query;
  const params = {};
  let clause = '';

  if (from !== undefined) {
    if (typeof from !== 'string' || !DATE_RE.test(from) || Number.isNaN(new Date(from).getTime())) {
      return { error: 'from must be a valid date in YYYY-MM-DD format' };
    }
    clause += ' AND ws.started_at >= :fromDate';
    params.fromDate = from;
  }
  if (to !== undefined) {
    if (typeof to !== 'string' || !DATE_RE.test(to) || Number.isNaN(new Date(to).getTime())) {
      return { error: 'to must be a valid date in YYYY-MM-DD format' };
    }
    // "< to + 1 day" makes the end date inclusive for DATETIME columns.
    clause += ' AND ws.started_at < DATE_ADD(:toDate, INTERVAL 1 DAY)';
    params.toDate = to;
  }
  if (from !== undefined && to !== undefined && from > to) {
    return { error: 'from cannot be after to' };
  }
  return { clause, params };
}

// GET /api/analytics/volume?group_by=day|week&from=&to=
// Time series of training volume for the trend chart.
async function getVolumeSeries(req, res, next) {
  const groupBy = req.query.group_by || 'day';
  if (groupBy !== 'day' && groupBy !== 'week') {
    return res.status(400).json({ error: "group_by must be 'day' or 'week'" });
  }
  const range = parseDateRange(req.query);
  if (range.error) return res.status(400).json({ error: range.error });

  // Whitelisted expressions - groupBy was validated above, never raw input.
  // Weeks are labeled by their Sunday start date (DAYOFWEEK: Sunday = 1),
  // matching the scheduling convention used elsewhere in the app.
  const periodExpr =
    groupBy === 'week'
      ? "DATE_FORMAT(DATE_SUB(ws.started_at, INTERVAL (DAYOFWEEK(ws.started_at) - 1) DAY), '%Y-%m-%d')"
      : "DATE_FORMAT(ws.started_at, '%Y-%m-%d')";

  try {
    const [rows] = await pool.execute(
      `SELECT ${periodExpr} AS period,
              COUNT(DISTINCT ws.id) AS workout_count,
              COUNT(st.id) AS set_count,
              COALESCE(SUM(st.weight * st.reps), 0) AS total_volume
       FROM workout_sessions ws
       LEFT JOIN session_exercises se ON se.session_id = ws.id
       LEFT JOIN workout_sets st ON st.session_exercise_id = se.id
       WHERE ws.user_id = :userId${range.clause}
       GROUP BY period
       ORDER BY period`,
      { userId: req.user.id, ...range.params }
    );

    const points = rows.map((r) => ({ ...r, total_volume: Number(r.total_volume) }));
    return res.json({ group_by: groupBy, points });
  } catch (err) {
    return next(err);
  }
}

// GET /api/analytics/volume-by-muscle?from=&to=
// Volume and set counts per muscle group for the distribution chart.
async function getVolumeByMuscle(req, res, next) {
  const range = parseDateRange(req.query);
  if (range.error) return res.status(400).json({ error: range.error });

  try {
    const [rows] = await pool.execute(
      `SELECT e.muscle_group,
              COUNT(st.id) AS set_count,
              COALESCE(SUM(st.weight * st.reps), 0) AS total_volume
       FROM workout_sets st
       JOIN session_exercises se ON se.id = st.session_exercise_id
       JOIN workout_sessions ws ON ws.id = se.session_id
       JOIN exercises e ON e.id = se.exercise_id
       WHERE ws.user_id = :userId${range.clause}
       GROUP BY e.muscle_group
       ORDER BY total_volume DESC`,
      { userId: req.user.id, ...range.params }
    );

    const groups = rows.map((r) => ({ ...r, total_volume: Number(r.total_volume) }));
    return res.json({ groups });
  } catch (err) {
    return next(err);
  }
}

// GET /api/analytics/progression/:exerciseId?from=&to=
// One point per workout containing the exercise: the heaviest weight lifted
// for a full rep (same rule as MAX_WEIGHT records), best reps, and the
// exercise's volume in that session. This is the data behind the
// per-exercise progression line chart.
async function getProgression(req, res, next) {
  const exerciseId = Number(req.params.exerciseId);
  if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
    return res.status(400).json({ error: 'Invalid exercise id' });
  }
  const range = parseDateRange(req.query);
  if (range.error) return res.status(400).json({ error: range.error });

  try {
    const invisible = await findInvisibleExercises([exerciseId], req.user.id);
    if (invisible.length > 0) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    const [[exercise]] = await pool.execute(
      'SELECT id, name, muscle_group, category FROM exercises WHERE id = :id',
      { id: exerciseId }
    );

    const [rows] = await pool.execute(
      `SELECT ws.id AS workout_id,
              DATE_FORMAT(ws.started_at, '%Y-%m-%d') AS date,
              MAX(CASE WHEN st.reps >= 1 THEN st.weight END) AS max_weight,
              MAX(st.reps) AS max_reps,
              COUNT(st.id) AS set_count,
              COALESCE(SUM(st.weight * st.reps), 0) AS total_volume
       FROM workout_sessions ws
       JOIN session_exercises se ON se.session_id = ws.id AND se.exercise_id = :exerciseId
       JOIN workout_sets st ON st.session_exercise_id = se.id
       WHERE ws.user_id = :userId${range.clause}
       GROUP BY ws.id
       ORDER BY ws.started_at`,
      { exerciseId, userId: req.user.id, ...range.params }
    );

    const points = rows.map((r) => ({
      ...r,
      max_weight: r.max_weight === null ? null : Number(r.max_weight),
      total_volume: Number(r.total_volume),
    }));
    return res.json({ exercise, points });
  } catch (err) {
    return next(err);
  }
}

// GET /api/analytics/summary
// Headline numbers for the dashboard cards.
async function getSummary(req, res, next) {
  try {
    const [[totals]] = await pool.execute(
      `SELECT COUNT(DISTINCT ws.id) AS total_workouts,
              COUNT(DISTINCT CASE WHEN ws.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                                  THEN ws.id END) AS workouts_last_30_days,
              COUNT(st.id) AS total_sets,
              COALESCE(SUM(st.weight * st.reps), 0) AS total_volume,
              MIN(ws.started_at) AS first_workout_at,
              MAX(ws.started_at) AS last_workout_at
       FROM workout_sessions ws
       LEFT JOIN session_exercises se ON se.session_id = ws.id
       LEFT JOIN workout_sets st ON st.session_exercise_id = se.id
       WHERE ws.user_id = :userId`,
      { userId: req.user.id }
    );

    const [[{ records_count }]] = await pool.execute(
      'SELECT COUNT(*) AS records_count FROM personal_records WHERE user_id = :userId',
      { userId: req.user.id }
    );

    return res.json({
      summary: { ...totals, total_volume: Number(totals.total_volume), records_count },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getVolumeSeries, getVolumeByMuscle, getProgression, getSummary };
