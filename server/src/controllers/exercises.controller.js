// Exercise catalog.
// Visibility rule: every user sees the global catalog (is_custom = FALSE)
// plus ONLY their own custom exercises - other users' customs are invisible.
const pool = require('../config/db');

const MUSCLE_GROUPS = ['CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'ARMS', 'CORE', 'FULL_BODY'];
const CATEGORIES = ['STRENGTH', 'HYPERTROPHY', 'CARDIO'];

// GET /api/exercises?search=&muscle_group=&category=
// Filters are combined with AND; all values go through named placeholders.
async function listExercises(req, res, next) {
  try {
    const { search, muscle_group, category } = req.query;
    const params = { userId: req.user.id };

    let sql = `SELECT id, name, muscle_group, category, is_custom
               FROM exercises
               WHERE (is_custom = FALSE OR created_by = :userId)`;

    if (search) {
      sql += ' AND name LIKE :search';
      params.search = `%${search}%`;
    }
    if (muscle_group) {
      if (!MUSCLE_GROUPS.includes(muscle_group)) {
        return res.status(400).json({
          error: `muscle_group must be one of: ${MUSCLE_GROUPS.join(', ')}`,
        });
      }
      sql += ' AND muscle_group = :muscleGroup';
      params.muscleGroup = muscle_group;
    }
    if (category) {
      if (!CATEGORIES.includes(category)) {
        return res.status(400).json({
          error: `category must be one of: ${CATEGORIES.join(', ')}`,
        });
      }
      sql += ' AND category = :category';
      params.category = category;
    }

    sql += ' ORDER BY name';
    const [rows] = await pool.execute(sql, params);
    return res.json({ exercises: rows });
  } catch (err) {
    return next(err);
  }
}

// POST /api/exercises  { name, muscle_group, category }
async function createExercise(req, res, next) {
  try {
    const { name, muscle_group, category } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({ error: 'Name must be 2-100 characters' });
    }
    if (!MUSCLE_GROUPS.includes(muscle_group)) {
      return res.status(400).json({
        error: `muscle_group must be one of: ${MUSCLE_GROUPS.join(', ')}`,
      });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: `category must be one of: ${CATEGORIES.join(', ')}`,
      });
    }

    // Reject names that collide with anything this user can already see
    // (global catalog or their own customs).
    const [dupes] = await pool.execute(
      `SELECT id FROM exercises
       WHERE name = :name AND (is_custom = FALSE OR created_by = :userId)`,
      { name: name.trim(), userId: req.user.id }
    );
    if (dupes.length > 0) {
      return res.status(409).json({ error: 'An exercise with this name already exists in your catalog' });
    }

    const [result] = await pool.execute(
      `INSERT INTO exercises (name, muscle_group, category, is_custom, created_by)
       VALUES (:name, :muscleGroup, :category, TRUE, :userId)`,
      { name: name.trim(), muscleGroup: muscle_group, category, userId: req.user.id }
    );

    return res.status(201).json({
      exercise: {
        id: result.insertId,
        name: name.trim(),
        muscle_group,
        category,
        is_custom: true,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/exercises/:id - only the owner's custom exercises.
// The WHERE clause makes ownership part of the query itself, so a wrong id,
// a global exercise, or another user's custom all fall through to 404.
async function deleteExercise(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid exercise id' });
    }

    const [result] = await pool.execute(
      `DELETE FROM exercises
       WHERE id = :id AND is_custom = TRUE AND created_by = :userId`,
      { id, userId: req.user.id }
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Custom exercise not found' });
    }
    return res.status(204).send();
  } catch (err) {
    // FK RESTRICT: the exercise appears in logged workout history or PRs.
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'Exercise is used in logged workouts and cannot be deleted' });
    }
    return next(err);
  }
}

module.exports = { listExercises, createExercise, deleteExercise };
