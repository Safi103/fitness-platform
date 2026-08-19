const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const {
  listRoutines,
  getRoutine,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  setSchedule,
  getWeeklySchedule,
} = require('../controllers/routines.controller');

const router = Router();

router.use(requireAuth);

// NOTE: /schedule must be registered before /:id, otherwise Express would
// try to parse the literal word "schedule" as a routine id.
router.get('/schedule', getWeeklySchedule);

router.get('/', listRoutines);
router.get('/:id', getRoutine);
router.post('/', createRoutine);
router.put('/:id', updateRoutine);
router.put('/:id/schedule', setSchedule);
router.delete('/:id', deleteRoutine);

module.exports = router;
