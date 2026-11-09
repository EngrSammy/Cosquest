const { INTERESTS, isValidInterestKey } = require('../models/interestModel');
const userModel = require('../models/userModel');

// GET /api/interests (public - same 16 chips as the front-end's onboarding step 3 grid)
function listInterests(req, res) {
  return res.json({ interests: INTERESTS });
}

// PUT /api/users/me/interests  (onboarding step 3 - replaces the full set, like the front-end toggle grid)
async function setInterests(req, res) {
  const { interests } = req.body;
  if (!Array.isArray(interests)) {
    return res.status(400).json({ error: 'interests must be an array of interest keys.' });
  }
  const invalid = interests.filter((k) => !isValidInterestKey(k));
  if (invalid.length) {
    return res.status(400).json({ error: `Unknown interest key(s): ${invalid.join(', ')}` });
  }

  const deduped = [...new Set(interests)];
  const updated = await userModel.updateUser(req.userId, (user) => {
    user.interests = deduped;
  });
  return res.json({ user: userModel.sanitize(updated) });
}

module.exports = { listInterests, setInterests };
