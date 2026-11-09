const express = require('express');
const { identifyUser } = require('../middleware/identifyUser');
const { asyncHandler } = require('../utils/asyncHandler');
const { listInterests, setInterests } = require('../controllers/interestController');

const router = express.Router();

router.get('/interests', listInterests); // public
router.put('/users/me/interests', asyncHandler(identifyUser), asyncHandler(setInterests)); // email or Bearer token

module.exports = router;
