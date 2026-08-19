// Express application: middleware, routes, and error handling.
const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');
const exerciseRoutes = require('./routes/exercises.routes');
const routineRoutes = require('./routes/routines.routes');
const workoutRoutes = require('./routes/workouts.routes');
const recordRoutes = require('./routes/records.routes');
const analyticsRoutes = require('./routes/analytics.routes');

const app = express();

// Allows the API to be called from a client served on a different origin.
// The documented dev setup proxies /api through Vite, so requests there are
// same-origin and this middleware is not exercised.
app.use(cors());

app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/routines', routineRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/analytics', analyticsRoutes);

// 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler - controllers forward errors here via next(err)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
