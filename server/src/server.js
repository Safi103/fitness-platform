// Entry point: load environment variables, then start the HTTP server.
require('dotenv').config();

// Fail fast on missing secrets instead of issuing unverifiable tokens.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'CHANGE_ME_TO_A_LONG_RANDOM_STRING') {
  console.error('JWT_SECRET is not set. Copy server/.env.example to server/.env and set a real secret.');
  process.exit(1);
}

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Fitness Platform API listening on http://localhost:${PORT}`);
});
