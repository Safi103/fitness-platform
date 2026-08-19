// Profile: baseline metrics used later by analytics (age, body weight,
// height) and the display unit preference (KG / LBS).
const pool = require('../config/db');

const PROFILE_COLUMNS =
  'id, name, email, age, body_weight, height, unit_preference, created_at';

async function getProfile(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT ${PROFILE_COLUMNS} FROM users WHERE id = :id`,
      { id: req.user.id }
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: rows[0] });
  } catch (err) {
    return next(err);
  }
}

// Partial update: only the fields present in the body are changed.
// Column names come exclusively from this validated whitelist - never from
// user input - and all values go through named placeholders.
async function updateProfile(req, res, next) {
  try {
    const body = req.body || {};
    const updates = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters' });
      }
      updates.name = body.name.trim();
    }
    if (body.age !== undefined) {
      const age = Number(body.age);
      if (!Number.isInteger(age) || age < 10 || age > 120) {
        return res.status(400).json({ error: 'Age must be an integer between 10 and 120' });
      }
      updates.age = age;
    }
    if (body.body_weight !== undefined) {
      const w = Number(body.body_weight);
      if (!Number.isFinite(w) || w <= 0 || w > 999) {
        return res.status(400).json({ error: 'Body weight must be a positive number' });
      }
      updates.body_weight = w;
    }
    if (body.height !== undefined) {
      const h = Number(body.height);
      if (!Number.isFinite(h) || h <= 0 || h > 300) {
        return res.status(400).json({ error: 'Height must be a positive number of centimeters' });
      }
      updates.height = h;
    }
    if (body.unit_preference !== undefined) {
      if (body.unit_preference !== 'KG' && body.unit_preference !== 'LBS') {
        return res.status(400).json({ error: 'unit_preference must be KG or LBS' });
      }
      updates.unit_preference = body.unit_preference;
    }

    const keys = Object.keys(updates);
    if (keys.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClause = keys.map((k) => `${k} = :${k}`).join(', ');
    await pool.execute(`UPDATE users SET ${setClause} WHERE id = :id`, {
      ...updates,
      id: req.user.id,
    });

    const [rows] = await pool.execute(
      `SELECT ${PROFILE_COLUMNS} FROM users WHERE id = :id`,
      { id: req.user.id }
    );
    return res.json({ user: rows[0] });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getProfile, updateProfile };
