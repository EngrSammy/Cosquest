/**
 * Wraps an async Express handler so a thrown/rejected error is passed to
 * next(err) instead of becoming an unhandled promise rejection.
 *
 * Express 4 does NOT catch errors from async route handlers automatically -
 * without this, any unexpected error (a bad DB write, a network blip, etc.)
 * crashes the entire Node process instead of just failing that one request.
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
