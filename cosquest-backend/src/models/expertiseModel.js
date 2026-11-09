/**
 * EXPERTISE ROLES - shown under people's names ("Front-end", "Back-end"),
 * and used by role pings later (spec: "automatic role notification").
 *
 * >>> THE ONE PLACE TO EDIT <<< Add, rename or remove roles here; the app
 * reads them from GET /api/expertise, so no app update is needed.
 * Expertise is NOT rank and gives NO chat powers.
 */
const EXPERTISE = [
  { key: 'quest_coordination', label: 'Quest coordination' },
  { key: 'front_end', label: 'Front-end' },
  { key: 'back_end', label: 'Back-end' },
  { key: 'design', label: 'Design' },
  { key: 'community', label: 'Community' },
  { key: 'costume_crafting', label: 'Costume crafting' },
  { key: 'photography', label: 'Photography' },
  { key: 'events', label: 'Events' },
];

function isValidExpertise(key) {
  return EXPERTISE.some((item) => item.key === key);
}

function expertiseLabel(key) {
  return EXPERTISE.find((item) => item.key === key)?.label || null;
}

module.exports = { EXPERTISE, isValidExpertise, expertiseLabel };
