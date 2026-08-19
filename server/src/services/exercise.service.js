// Shared catalog-visibility rule: a user may reference global exercises and
// their OWN custom exercises - never another user's customs.
// Used by the routines and workouts controllers.
//
// The IN clause is built from generated placeholder names (:id0, :id1, ...),
// never from user input; all values go through placeholders.
const pool = require('../config/db');

async function findInvisibleExercises(exerciseIds, userId) {
  const unique = [...new Set(exerciseIds)];
  if (unique.length === 0) return [];

  const placeholders = unique.map((_, i) => `:id${i}`).join(', ');
  const params = { userId };
  unique.forEach((id, i) => {
    params[`id${i}`] = id;
  });

  const [rows] = await pool.execute(
    `SELECT id FROM exercises
     WHERE id IN (${placeholders}) AND (is_custom = FALSE OR created_by = :userId)`,
    params
  );
  const visible = new Set(rows.map((r) => r.id));
  return unique.filter((id) => !visible.has(id));
}

module.exports = { findInvisibleExercises };
