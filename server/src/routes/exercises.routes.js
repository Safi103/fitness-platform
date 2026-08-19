const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const {
  listExercises,
  createExercise,
  deleteExercise,
} = require('../controllers/exercises.controller');

const router = Router();

router.use(requireAuth);
router.get('/', listExercises);
router.post('/', createExercise);
router.delete('/:id', deleteExercise);

module.exports = router;
