const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const {
  createWorkout,
  listWorkouts,
  getWorkout,
  deleteWorkout,
} = require('../controllers/workouts.controller');

const router = Router();

router.use(requireAuth);
router.get('/', listWorkouts);
router.get('/:id', getWorkout);
router.post('/', createWorkout);
router.delete('/:id', deleteWorkout);

module.exports = router;
