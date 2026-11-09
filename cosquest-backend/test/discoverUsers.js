// Runs against the disposable database created by runWithMemoryMongo.
const User = require('../src/models/User');
const Block = require('../src/models/Block');
const { signToken } = require('../src/utils/token');

async function run(baseUrl) {
  let pass = 0;
  let fail = 0;
  function check(ok, name, value) {
    if (ok) { pass++; console.log(`  ok  - ${name}`); }
    else { fail++; console.log(`FAIL - ${name}`, JSON.stringify(value)); }
  }
  async function get(path, token) {
    const response = await fetch(baseUrl + path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: response.status, data: await response.json() };
  }

  console.log('\n--- discover users ---');
  const existing = await User.countDocuments({ onboardingComplete: true });
  const suffix = Date.now();
  const fixtures = await Promise.all(Array.from({ length: 6 }, (_, index) => User.create({
    profile: { username: `Disc${index}${suffix}`, usernameNormalized: `disc${index}${suffix}` },
    onboardingComplete: index !== 5,
    // Sort these fixtures ahead of users created by preceding suites.
    createdAt: new Date(Date.UTC(2100, 0, index + 1)),
    lastActiveAt: new Date(),
    passwordHash: 'not-for-api-output',
  })));
  const [viewer, older, newer, blocked, blocker, unfinished] = fixtures;
  const token = signToken(viewer.id, viewer.tokenVersion);
  await Block.create([
    { blocker: viewer._id, blocked: blocked._id },
    { blocker: blocker._id, blocked: viewer._id },
  ]);

  try {
    check((await get('/api/users/discover')).status === 401, 'discovery requires authentication');
    check((await get('/api/users/discover', signToken(unfinished.id, unfinished.tokenVersion))).status === 403,
      'discovery requires completed onboarding');

    const first = await get('/api/users/discover?limit=1', token);
    check(first.status === 200 && first.data.users?.[0]?.id === newer.id,
      'discovery works without a search term and returns newest eligible user first', first);
    check(first.data.pagination?.total === existing + 2 && first.data.pagination?.page === 1 && first.data.pagination?.hasMore === true,
      'discovery totals exclude self, both block directions, and incomplete accounts', first);

    const second = await get('/api/users/discover?limit=1&page=2', token);
    check(second.status === 200 && second.data.users?.[0]?.id === older.id,
      'discovery pagination advances to the next eligible user', second);
    const preview = first.data.users?.[0] || {};
    check(preview.username === newer.profile.username && !('passwordHash' in preview) && !('email' in preview) && !('tokenVersion' in preview),
      'discovery returns public previews only', preview);

    const empty = await get(`/api/users/discover?limit=1&page=${existing + 3}`, token);
    check(empty.status === 200 && empty.data.users?.length === 0 && empty.data.pagination?.hasMore === false,
      'discovery beyond the last page returns an empty list', empty);
    const defaults = await get('/api/users/discover?limit=invalid&page=-1', token);
    check(defaults.data.pagination?.limit === 20 && defaults.data.pagination?.page === 1,
      'discovery uses existing pagination defaults for invalid values', defaults);
    const capped = await get('/api/users/discover?limit=999', token);
    check(capped.data.pagination?.limit === 50, 'discovery caps page size at 50', capped);

    check((await get('/api/users/search', token)).status === 400, 'search still requires a search term');
    const search = await get(`/api/users/search?search=${newer.profile.username}`, token);
    check(search.status === 200 && search.data.users?.[0]?.id === newer.id, 'existing search route still finds users', search);
  } finally {
    const ids = fixtures.map((user) => user._id);
    await Block.deleteMany({ $or: [{ blocker: { $in: ids } }, { blocked: { $in: ids } }] });
    await User.deleteMany({ _id: { $in: ids } });
  }
  return { pass, fail };
}

module.exports = { run };
