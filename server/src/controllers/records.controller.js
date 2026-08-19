// Personal records: the user's current bests, maintained by pr.service
// during workout saves.
const pool = require('../config/db');

// GET /api/records - one row per (exercise, record type), joined with the
// catalog for display, ordered by exercise name.
async function listRecords(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT pr.exercise_id, e.name AS exercise_name, e.muscle_group,
              pr.record_type, pr.value, pr.achieved_at
       FROM personal_records pr
       JOIN exercises e ON e.id = pr.exercise_id
       WHERE pr.user_id = :userId
       ORDER BY e.name, pr.record_type`,
      { userId: req.user.id }
    );

    const records = rows.map((r) => ({ ...r, value: Number(r.value) }));
    return res.json({ records });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listRecords };
