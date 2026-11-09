const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(String(username || '').trim());
}

function passwordError(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9\s]/.test(password)) {
    return 'password must include an uppercase letter, lowercase letter, number, and special character.';
  }
  return null;
}

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

module.exports = { isValidEmail, isValidUsername, normalizeUsername, passwordError };
