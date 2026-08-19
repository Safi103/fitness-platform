const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const {
  getVolumeSeries,
  getVolumeByMuscle,
  getProgression,
  getSummary,
} = require('../controllers/analytics.controller');

const router = Router();

router.use(requireAuth);
router.get('/summary', getSummary);
router.get('/volume', getVolumeSeries);
router.get('/volume-by-muscle', getVolumeByMuscle);
router.get('/progression/:exerciseId', getProgression);

module.exports = router;
