// Registration and login.
// Passwords are stored only as bcrypt hashes (cost factor 10).
// The JWT payload is minimal - just the user id in `sub` - so tokens stay
// small and carry no profile data; anything fresh is read from the DB.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
}

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password_hash) VALUES (:name, :email, :hash)',
      { name: name.trim(), email: email.toLowerCase(), hash: passwordHash }
    );

    const token = signToken(result.insertId);
    return res.status(201).json({
      token,
      user: { id: result.insertId, name: name.trim(), email: email.toLowerCase() },
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email is already registered' });
    }
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const [rows] = await pool.execute(
      'SELECT id, name, email, password_hash FROM users WHERE email = :email',
      { email: String(email).toLowerCase() }
    );
    const user = rows[0];

    // Identical response whether the email is unknown or the password is
    // wrong, so the endpoint cannot be used to enumerate registered emails.
    const valid = user && (await bcrypt.compare(password, user.password_hash));
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user.id);
    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login };
