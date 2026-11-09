const User = require('../src/models/User');
const { AVATARS } = require('../src/models/avatarModel');
const STATIC_IDS = require('../src/data/cloudinaryAvatarPublicIds');
const catalog = require('../src/utils/avatarCatalog');
const { signToken } = require('../src/utils/token');

async function run(baseUrl) {
  let pass = 0;
  let fail = 0;

  function check(ok, name, value) {
    if (ok) {
      pass += 1;
      console.log(`  ok  - ${name}`);
    } else {
      fail += 1;
      console.log(`FAIL - ${name}`, JSON.stringify(value));
    }
  }

  async function request(method, path, token, body) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data = text;
    try { data = JSON.parse(text); } catch (error) { /* html */ }
    return { status: response.status, data };
  }

  const originalList = catalog.source.list;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const user = await User.create({
    profile: { username: `Avatar${suffix}`.slice(0, 20), usernameNormalized: `avatar${suffix}`.slice(0, 20), firstName: 'Ava', lastName: 'Tar' },
    onboardingComplete: true,
    faction: 'ascendants',
  });
  const token = signToken(user.id, user.tokenVersion);
  const newKeyA = catalog.keyForPublicId('brandNewAvatarA');

  try {
    console.log('\n--- avatar catalog (asks Cloudinary what exists) ---');

    // Cloudinary reports: the first 2 built-in avatars are gone, 3 new ones exist
    // (one with a caption), plus app upload folders that must be ignored.
    let calls = 0;
    catalog.source.list = async () => {
      calls += 1;
      return [
        ...STATIC_IDS.slice(2).map((publicId) => ({ publicId, caption: null })),
        { publicId: 'brandNewAvatarA', caption: 'Brand New A' },
        { publicId: 'brandNewAvatarB', caption: null },
        { publicId: 'brandNewAvatarC', caption: null },
      ];
    };
    catalog.resetForTests();
    const listed = await request('GET', '/api/meta/avatars');
    const avatars = listed.data.avatars || [];
    check(listed.status === 200 && avatars.length === AVATARS.length - 2 + 3, 'picker = what Cloudinary has (100 - 2 removed + 3 new)', avatars.length);
    check(avatars[0].key === AVATARS[2].key, 'built-in avatars keep their keys and order', avatars[0]);
    check(!avatars.some((a) => a.key === AVATARS[0].key), 'an avatar deleted from Cloudinary is no longer offered');
    const newA = avatars.find((a) => a.key === newKeyA);
    check(newA && newA.label === 'Brand New A' && newA.imageUrl.includes('brandNewAvatarA'), 'a newly uploaded avatar appears with its caption and image URL', newA);
    check(avatars.filter((a) => a.key.startsWith('cl-')).length === 3, 'each new avatar gets a stable key');
    check(avatars.every((a) => a.key && a.label && a.imageUrl.startsWith('http')), 'every option has key, label and image URL');

    await request('GET', '/api/meta/avatars');
    check(calls === 1, 'the Cloudinary listing is cached between requests', calls);

    const pickNew = await request('PATCH', '/api/users/me/avatar', token, { avatar: newKeyA });
    check(pickNew.status === 200 && pickNew.data.user.profile.avatarKey === newKeyA, 'a newly discovered avatar can be selected', pickNew);
    const pickRemoved = await request('PATCH', '/api/users/me/avatar', token, { avatar: AVATARS[0].key });
    check(pickRemoved.status === 200, 'a built-in key stays valid so existing users are not broken', pickRemoved);
    const pickBogus = await request('PATCH', '/api/users/me/avatar', token, { avatar: 'cl-0000000000' });
    check(pickBogus.status === 400, 'an unknown discovered-style key is still rejected', pickBogus);

    await request('PATCH', '/api/users/me/avatar', token, { avatar: newKeyA });
    const page = await request('GET', `/u/${encodeURIComponent(user.profile.username)}`);
    check(page.status === 200 && String(page.data).includes('brandNewAvatarA'), 'the shared profile page shows a discovered avatar');

    // Cloudinary starts failing: keep serving the last good listing.
    catalog.source.list = async () => { throw new Error('Rate limit exceeded'); };
    catalog.resetForTests({ expireOnly: true });
    const stale = await request('GET', '/api/meta/avatars');
    check(stale.status === 200 && stale.data.avatars.length === AVATARS.length + 1, 'if Cloudinary fails, the last good list is still served', stale.data.avatars?.length);

    // Cold start while Cloudinary is down: built-in list.
    catalog.resetForTests();
    const cold = await request('GET', '/api/meta/avatars');
    check(cold.status === 200 && cold.data.avatars.length === AVATARS.length && cold.data.avatars[0].key === AVATARS[0].key, 'with no cache and Cloudinary down, the built-in 100 are served', cold.data.avatars?.length);

    // Cloudinary answers but lists nothing (e.g. a wrong prefix): never an empty picker.
    catalog.source.list = async () => [];
    catalog.resetForTests();
    const empty = await request('GET', '/api/meta/avatars');
    check(empty.status === 200 && empty.data.avatars.length === AVATARS.length, 'an empty Cloudinary listing never empties the picker', empty.data.avatars?.length);
  } finally {
    catalog.source.list = originalList;
    catalog.resetForTests();
  }

  return { pass, fail };
}

module.exports = { run };
