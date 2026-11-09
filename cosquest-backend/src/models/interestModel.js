/**
 * Extracted directly from the INTERESTS array in cosquest-app-v5.html
 * (originally 16 interest chips shown in onboarding step 3; trimmed to the
 * first 12, through "News & Politics").
 */
const INTERESTS = [
  { key: 'anime', name: 'Anime & Manga' },
  { key: 'comic', name: 'Comics' },
  { key: 'movie', name: 'Movies & TV' },
  { key: 'game', name: 'Video Games' },
  { key: 'toon', name: 'Cartoons' },
  { key: 'scifi', name: 'Sci-Fi' },
  { key: 'fantasy', name: 'Fantasy' },
  { key: 'horror', name: 'Horror' },
  { key: 'cosplay', name: 'Cosplay & Props' },
  { key: 'sports', name: 'Sports' },
  { key: 'music', name: 'Music' },
  { key: 'news', name: 'News & Politics' },
];

const INTEREST_KEYS = INTERESTS.map((i) => i.key);

function isValidInterestKey(key) {
  return INTEREST_KEYS.includes(key);
}

module.exports = { INTERESTS, INTEREST_KEYS, isValidInterestKey };
