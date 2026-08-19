// Liveness endpoint: confirms the API is up and can reach MySQL.
const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

router.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});

module.exports = router;
