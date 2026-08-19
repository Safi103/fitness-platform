const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const { listRecords } = require('../controllers/records.controller');

const router = Router();

router.use(requireAuth);
router.get('/', listRecords);

module.exports = router;
