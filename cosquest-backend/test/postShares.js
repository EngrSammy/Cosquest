const User = require('../src/models/User');
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
    return { status: response.status, data: await response.json() };
  }

  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const users = await Promise.all([1, 2, 3, 4].map((index) => User.create({
    profile: {
      username: `Sharer${index}${suffix}`.slice(0, 20),
      usernameNormalized: `sharer${index}${suffix}`.slice(0, 20),
      firstName: 'Share',
      lastName: `User${index}`,
      avatarKey: 'green-knight',
    },
    onboardingComplete: true,
    faction: 'ascendants',
  })));
  const [author, sharer, resharer, blockedSharer] = users.map((user) => ({
    id: user.id,
    username: user.profile.username,
    token: signToken(user.id, user.tokenVersion),
  }));

  console.log('\n--- share a post to the feed ---');
  const original = (await request('POST', '/api/posts', author.token, { type: 'thought', content: 'Original thought' })).data.post;
  check(original && original.sharedPost === null, 'ordinary posts carry sharedPost: null', original);

  const shared = await request('POST', `/api/posts/${original.id}/share-to-feed`, sharer.token, { content: ' Look at this ' });
  check(
    shared.status === 201 && shared.data.post.type === 'share' && shared.data.post.content === 'Look at this' &&
      shared.data.post.sharedPost?.id === original.id && shared.data.post.sharedPost.content === 'Original thought' &&
      shared.data.post.sharedPost.author?.username === author.username && shared.data.post.author.username === sharer.username &&
      shared.data.originalPostId === original.id && shared.data.shareCount === 1,
    'sharing creates a share post that shows the original inside it',
    shared
  );

  const again = await request('POST', `/api/posts/${original.id}/share-to-feed`, sharer.token, {});
  check(again.status === 201 && again.data.shareCount === 1, 'sharing again adds a post but counts once per person', again);

  const reshared = await request('POST', `/api/posts/${shared.data.post.id}/share-to-feed`, resharer.token, {});
  check(
    reshared.status === 201 && reshared.data.post.sharedPost?.id === original.id && reshared.data.originalPostId === original.id && reshared.data.shareCount === 2,
    'sharing a share points at the original, not at the share',
    reshared
  );

  const fetched = await request('GET', `/api/posts/${shared.data.post.id}`);
  check(fetched.status === 200 && fetched.data.post.sharedPost?.id === original.id, 'GET one share post includes the original', fetched);
  const originalAfter = await request('GET', `/api/posts/${original.id}`);
  check(originalAfter.data.post.shareCount === 2, 'the original shows how many people shared it', originalAfter.data.post);

  const shareList = await request('GET', '/api/posts?type=share');
  check(
    shareList.status === 200 && shareList.data.posts.length >= 3 && shareList.data.posts.every((post) => post.type === 'share' && post.sharedPost),
    'GET /api/posts?type=share lists share posts with their originals',
    shareList.data.posts?.length
  );
  const userShares = await request('GET', `/api/users/${sharer.username}/posts?type=share`);
  check(userShares.status === 200 && userShares.data.posts.length === 2, "a person's profile posts include their shares", userShares.data.posts?.length);
  check((await request('GET', '/api/posts?type=bogus')).status === 400, 'an unknown post type is still rejected');

  console.log('\n--- share guards ---');
  check((await request('POST', `/api/posts/${original.id}/share-to-feed`, null, {})).status === 401, 'sharing requires login');
  check((await request('POST', '/api/posts/000000000000000000000000/share-to-feed', sharer.token, {})).status === 404, 'sharing a missing post returns 404');
  check((await request('POST', `/api/posts/${original.id}/share-to-feed`, sharer.token, { content: 'x'.repeat(2201) })).status === 400, 'a caption over 2,200 characters is rejected');

  await request('POST', `/api/users/${blockedSharer.username}/block`, author.token);
  check((await request('POST', `/api/posts/${original.id}/share-to-feed`, blockedSharer.token, {})).status === 404, 'a blocked person cannot share the post');
  await request('DELETE', `/api/users/${blockedSharer.username}/block`, author.token);

  console.log('\n--- deleting ---');
  const keep = (await request('POST', '/api/posts', author.token, { type: 'thought', content: 'Second thought' })).data.post;
  const keepShare = await request('POST', `/api/posts/${keep.id}/share-to-feed`, sharer.token, {});
  check(keepShare.data.shareCount === 1, 'second original starts at one share', keepShare.data);
  const removed = await request('DELETE', `/api/posts/${keepShare.data.post.id}`, sharer.token);
  const keepAfter = await request('GET', `/api/posts/${keep.id}`);
  check(removed.status === 200 && keepAfter.data.post.shareCount === 0, 'deleting your share post takes the share off the original', keepAfter.data.post);

  check((await request('DELETE', `/api/posts/${original.id}`, author.token)).status === 200, 'the original author can delete the original');
  const orphan = await request('GET', `/api/posts/${shared.data.post.id}`);
  check(orphan.status === 200 && orphan.data.post.sharedPost?.unavailable === true, 'a share of a deleted original reads as unavailable, not an error', orphan.data);
  check((await request('POST', `/api/posts/${shared.data.post.id}/share-to-feed`, resharer.token, {})).status === 404, 'a share of a deleted original cannot be shared again');

  return { pass, fail };
}

module.exports = { run };
