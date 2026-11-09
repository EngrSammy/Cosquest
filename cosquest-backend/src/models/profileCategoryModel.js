const PROFILE_CATEGORIES = [
  { key: 'artist', name: 'Artist' },
  { key: 'musician-band', name: 'Musician/band' },
  { key: 'blogger', name: 'Blogger' },
  { key: 'clothing-brand', name: 'Clothing (Brand)' },
  { key: 'community', name: 'Community' },
  { key: 'digital-creator', name: 'Digital creator' },
  { key: 'education', name: 'Education' },
  { key: 'entrepreneur', name: 'Entrepreneur' },
  { key: 'health-beauty', name: 'Health/beauty' },
];

const PROFILE_CATEGORY_KEYS = PROFILE_CATEGORIES.map((category) => category.key);

function isValidProfileCategory(key) {
  return PROFILE_CATEGORY_KEYS.includes(key);
}

module.exports = { PROFILE_CATEGORIES, PROFILE_CATEGORY_KEYS, isValidProfileCategory };
