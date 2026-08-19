const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const { getProfile, updateProfile } = require('../controllers/users.controller');

const router = Router();

router.use(requireAuth);
router.get('/me', getProfile);
router.put('/me', updateProfile);

module.exports = router;
