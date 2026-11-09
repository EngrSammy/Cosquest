// Runs only inside runWithMemoryMongo against its disposable database.
const User = require('../src/models/User');
const CommentLike = require('../src/models/CommentLike');

async function run(baseUrl) {
  let pass = 0;
  let fail = 0;
  function check(ok, name, value) {
    if (ok) { pass++; console.log(`  ok  - ${name}`); }
    else { fail++; console.log(`FAIL - ${name}`, JSON.stringify(value)); }
  }
  async function call(method, path, token, body) {
    const form = body instanceof FormData;
    const response = await fetch(`${baseUrl}${path}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? form ? body : JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }
  const password = 'Quest@1234';
  const suffix = Date.now();
  async function account(index, complete = true) {
    const username = `Ext${index}${suffix}`;
    const signup = await call('POST', '/api/auth/signup', null, { username, password, confirmPassword: password });
    check(signup.status === 201 && signup.data.token && signup.data.onboardingRequired === true, 'signup creates session', signup);
    const token = signup.data.token;
    if (complete) {
      const before = await call('GET', '/api/chats', token);
      check(before.status === 403, 'signup session cannot skip onboarding', before);
      const finish = await call('POST', '/api/users/me/onboarding/complete', token, {
        profile: { firstName: 'Test', lastName: 'Member', username, age: 25, gender: 'Female', avatar: 'green-knight' },
        faction: 'ascendants', interests: ['anime'], preferences: { notificationsEnabled: true },
        location: { locationEnabled: true, lat: 6.5244, lng: 3.3792 },
      });
      check(finish.status === 200 && finish.data.onboardingRequired === false, 'onboarding completes with signup token', finish);
      check((await call('GET', '/api/chats', token)).status === 200, 'same signup token enters app without login');
    }
    return { id: signup.data.user.id, username, token };
  }
  console.log('\n--- community/settings additions ---');
  const a = await account(1);
  const b = await account(2);
  const c = await account(3);
  const unfinished = await account(4, false);
  const takeover = await call('POST', '/api/auth/signup', null, { username: unfinished.username, password: 'Wrong@1234', confirmPassword: 'Wrong@1234' });
  check(takeover.status === 401 && !takeover.data.token, 'resuming signup cannot replace the password or issue a session with a wrong password', takeover);
  const resume = await call('POST', '/api/auth/signup', null, { username: unfinished.username, password, confirmPassword: password });
  check(resume.status === 200 && resume.data.token && resume.data.resumed, 'correct password resumes signup', resume);

  const post = (await call('POST', '/api/posts', a.token, { type: 'thought', content: 'Share <script>alert(1)</script> safely' })).data.post;
  const base = `/api/posts/${post.id}/comments`;
  const root = (await call('POST', base, b.token, { body: 'Root' })).data.comment;
  const reply = (await call('POST', base, a.token, { body: 'Reply', parentComment: root.id })).data.comment;
  const nested = (await call('POST', base, b.token, { body: 'Reply again', parentComment: reply.id })).data.comment;
  check(nested.parentComment === root.id && nested.replyToComment === reply.id, 'reply to reply retains root thread and target');
  for (const item of [root, reply, nested]) {
    await call('POST', `${base}/${item.id}/likes`, a.token);
    const repeat = await call('POST', `${base}/${item.id}/likes`, a.token);
    check(repeat.status === 200 && repeat.data.likeCount === 1, 'comment/reply likes are idempotent', repeat);
  }
  const liked = await call('GET', `${base}?parentComment=${root.id}`, a.token);
  check(liked.data.comments.length === 2 && liked.data.comments.every((item) => item.likeCount === 1 && item.likedByMe), 'thread read returns like counts and viewer state', liked);
  const anonymous = await call('GET', `${base}?parentComment=${reply.id}`);
  check(anonymous.data.comments.every((item) => item.likeCount === 1 && item.likedByMe === false), 'anonymous read never claims viewer liked comment', anonymous);
  const foreign = (await call('POST', '/api/posts', a.token, { type: 'thought', content: 'Other post' })).data.post;
  check((await call('POST', `/api/posts/${foreign.id}/comments/${reply.id}/likes`, a.token)).status === 404, 'comment likes cannot cross posts');
  check((await call('POST', `${base}/${reply.id}/likes`)).status === 401, 'comment likes require authentication');
  const unlike = await call('DELETE', `${base}/${reply.id}/likes`, a.token);
  check(unlike.data.likeCount === 0 && !unlike.data.liked, 'reply unlike removes like', unlike);
  await call('DELETE', `${base}/${root.id}`, b.token);
  check(await CommentLike.countDocuments({ post: post.id }) === 0, 'thread deletion cleans up all comment likes');

  const postShare = await call('GET', `/api/posts/${post.id}/share`);
  const postPage = await fetch(postShare.data.url);
  const postHtml = await postPage.text();
  check(postPage.status === 200 && postHtml.includes('og:title') && !postHtml.includes('<script>'), 'post share URL renders HTML with escaped preview');
  await call('PATCH', '/api/users/me/privacy', a.token, { profileVisibility: 'private' });
  check((await fetch(postShare.data.url)).status === 404, 'private profile post is not exposed by public share page');
  await call('PATCH', '/api/users/me/privacy', a.token, { profileVisibility: 'public' });

  const dm = (await call('POST', '/api/chats/dm', a.token, { username: b.username })).data.chat.id;
  const chatBase = `/api/chats/${dm}`;
  const sent = (await call('POST', `${chatBase}/messages`, a.token, { content: 'Private message test' })).data.message;
  const messageBase = `${chatBase}/messages/${sent.id}`;
  const share = await call('GET', `${messageBase}/share`, a.token);
  const landing = await fetch(share.data.url);
  const html = await landing.text();
  check(landing.status === 200 && html.includes('og:title') && !html.includes('Private message test'), 'chat copy-link opens a generic page without leaking content');
  check((await call('GET', messageBase, b.token)).data.message.content === 'Private message test', 'recipient resolves linked message');
  check((await call('GET', messageBase, c.token)).status === 403 && (await call('GET', `${messageBase}/share`, c.token)).status === 403, 'nonmember cannot resolve or share private message');
  const ownReply = await call('POST', `${chatBase}/messages`, a.token, { content: 'Reply to myself', replyTo: sent.id });
  check(ownReply.status === 201 && ownReply.data.message.replyTo.id === sent.id, 'can reply to own chat message', ownReply);
  await call('POST', `${messageBase}/reactions`, b.token, { emoji: '❤️' });
  const changedReaction = await call('POST', `${messageBase}/reactions`, b.token, { emoji: '🔥' });
  check(changedReaction.data.reactions.length === 1 && changedReaction.data.reactions[0].emoji === '🔥', 'reaction replaces previous emoji');
  await call('PATCH', `${chatBase}/pinned-message`, a.token, { messageId: sent.id });
  await call('DELETE', messageBase + '?scope=me', b.token);
  const hiddenPin = await call('GET', chatBase, b.token);
  check(hiddenPin.data.chat.pinnedMessage === null, 'delete for me hides pinned banner');
  check((await call('GET', messageBase, b.token)).status === 404, 'deleted for me message unavailable via direct link');
  check((await call('GET', `${messageBase}/share`, b.token)).status === 404, 'deleted for me message cannot be shared');
  check((await call('POST', `${chatBase}/messages`, b.token, { content: 'Cannot reply', replyTo: sent.id })).status === 400, 'cannot reply to hidden message');
  check((await call('DELETE', messageBase + '?scope=typo', a.token)).status === 400, 'invalid delete scope fails explicitly');
  const forward = await call('POST', `${messageBase}/forward`, a.token, { targetUsername: c.username });
  check(forward.status === 201 && forward.data.conversationId && forward.data.message.forwarded, 'forward supplies destination conversation id');
  await call('DELETE', messageBase + '?scope=everyone', a.token);
  check((await call('PATCH', `${chatBase}/pinned-message`, a.token, { messageId: sent.id })).status === 400, 'deleted message cannot be repinned');
  check((await call('POST', `${messageBase}/reactions`, a.token, { emoji: '🔥' })).status === 400, 'deleted message cannot receive reactions');
  const forwardedRead = await call('GET', `/api/chats/${forward.data.conversationId}/messages/${forward.data.message.id}`, c.token);
  check(forwardedRead.data.message.content === 'Private message test', 'forwarded copy survives original deletion');

  const form = new FormData();
  form.append('media', new Blob(['plain document'], { type: 'text/plain' }), 'notes.txt');
  const file = await call('POST', `${chatBase}/messages`, a.token, form);
  check(file.status === 201 && file.data.message.kind === 'file' && file.data.message.media.resourceType === 'raw' && file.data.message.media.fileName === 'notes.txt' && file.data.message.media.sizeBytes === 14, 'document attachment retains metadata', file);
  const fileForward = await call('POST', `${chatBase}/messages/${file.data.message.id}/forward`, a.token, { targetUsername: c.username });
  check(fileForward.data.message.kind === 'file' && fileForward.data.message.media.fileName === 'notes.txt', 'forward preserves file metadata');
  const exe = new FormData();
  exe.append('media', new Blob(['bad'], { type: 'application/x-msdownload' }), 'bad.exe');
  check((await call('POST', `${chatBase}/messages`, a.token, exe)).status === 400, 'unsupported executable MIME type rejected');

  await User.updateOne({ _id: a.id }, { $set: { pointsBalance: 3000 } });
  await User.updateOne({ _id: b.id }, { $set: { pointsBalance: 4000 } });
  await User.updateOne({ _id: c.id }, { $set: { pointsBalance: 4000 } });
  await User.updateOne({ _id: unfinished.id }, { $set: { pointsBalance: 99999 } });
  const board = await call('GET', '/api/spotlight/leaderboard?interest=anime&limit=2', a.token);
  check(board.status === 200 && board.data.podium.length === 3 && board.data.podium[0].rank === 1 && board.data.podium[1].rank === 1 && board.data.podium[2].rank === 3 && board.data.me.rank === 3, 'leaderboard ranks points with ties and podium', board);
  check(board.data.leaders.length === 2 && !board.data.podium.some((row) => row.user.id === unfinished.id), 'leaderboard paginates and excludes incomplete accounts');
  check((await call('GET', '/api/spotlight/leaderboard?interest=invalid', a.token)).status === 400, 'invalid realm rejected');
  check((await call('GET', '/api/spotlight/leaderboard')).status === 401, 'leaderboard requires session');
  await call('POST', `/api/users/${b.username}/block`, a.token);
  const blockedBoard = await call('GET', '/api/spotlight/leaderboard', a.token);
  check(!blockedBoard.data.leaders.some((row) => row.user.id === b.id), 'leaderboard respects blocks');
  await call('DELETE', `/api/users/${b.username}/block`, a.token);

  check((await call('GET', '/api/users/me/settings')).status === 401, 'settings require bearer authentication');
  const settings = await call('GET', '/api/users/me/settings', a.token);
  check(settings.status === 200 && settings.data.account && settings.data.appearance && settings.data.notifications && settings.data.dataUsage, 'settings aggregate covers screenshot sections', settings);
  const appearance = await call('PATCH', '/api/users/me/appearance', a.token, { themeMode: 'dark', accentColor: '#123abc', fontSize: 'large', reduceMotion: true });
  check(appearance.status === 200 && appearance.data.appearance.reduceMotion, 'appearance preferences persist', appearance);
  check((await call('PATCH', '/api/users/me/appearance', a.token, { themeMode: 'invalid' })).status === 400, 'appearance enum validated');
  check((await call('PATCH', '/api/users/me/data-usage', a.token, { downloadOverWifiOnly: false, autoPlayVideos: false, imageQuality: 'low' })).status === 200, 'data usage preferences persist');
  const notificationBody = { questUpdates: false, factionNews: true, friendActivity: false, rankChanges: false, emailPromotionalEvents: true };
  check((await call('PATCH', '/api/users/me/preferences/notifications', a.token, notificationBody)).status === 200, 'new notification categories update independently');
  const prefs = await call('GET', '/api/users/me/preferences/notifications', a.token);
  check(prefs.data.notifications.factionNews === true && prefs.data.notifications.emailPromotionalEvents === true && prefs.data.notifications.questUpdates === false, 'notification read returns all new fields', prefs);
  await call('PATCH', '/api/users/me/privacy', a.token, { showOnlineStatus: false, allowFriendRequests: false });
  const otherView = await call('GET', chatBase, b.token);
  check(otherView.data.chat.otherParticipant.lastActiveAt === null, 'showOnlineStatus off hides presence from DM partner');
  const privateInfo = await call('PATCH', '/api/users/me/account', a.token, { displayName: 'Custom Name', phone: '+1 (555) 234-5678', dateOfBirth: '1998-10-12' });
  check(privateInfo.status === 200 && privateInfo.data.account.phone === '+15552345678' && privateInfo.data.account.dateOfBirth === '1998-10-12', 'account info persists private phone and birth date', privateInfo);
  const publicProfile = await call('GET', `/api/users/${a.username}/profile`);
  check(!JSON.stringify(publicProfile.data).includes('1998-10-12') && !JSON.stringify(publicProfile.data).includes('+15552345678'), 'private account details stay out of public profile');
  check(publicProfile.data.profile.name === 'Custom Name', 'account display name appears on public profile');
  check((await call('GET', `/api/posts/${post.id}`)).data.post.author.name === 'Custom Name', 'account display name appears on feed author');
  await call('PATCH', '/api/users/me/privacy', b.token, { allowDirectMessages: false });
  check((await call('POST', `${chatBase}/messages`, a.token, { content: 'blocked by preference' })).status === 403, 'DM preference also gates messages in existing conversations');
  check((await call('POST', `/api/chats/${forward.data.conversationId}/messages/${forward.data.message.id}/forward`, a.token, { targetConversationId: dm })).status === 403, 'forward by conversation id respects recipient DM preference');
  await call('PATCH', '/api/users/me/privacy', b.token, { allowDirectMessages: true });
  check(!(await call('GET', `/api/users/me?username=${a.username}`)).data.user.account, 'legacy user serializer excludes private account object');
  check((await call('PATCH', '/api/users/me/account', a.token, { dateOfBirth: '2020-02-31' })).status === 400, 'invalid birth date rejected');
  check((await call('PATCH', '/api/users/me/account', a.token, { email: `updated${suffix}@example.com` })).status === 401, 'login email change requires password');
  const emailUpdate = await call('PATCH', '/api/users/me/account', a.token, { email: `updated${suffix}@example.com`, currentPassword: password });
  check(emailUpdate.status === 200 && emailUpdate.data.token, 'login email change returns replacement session', emailUpdate);
  check((await call('GET', '/api/users/me/settings', a.token)).status === 401, 'email change invalidates previous sessions');
  a.token = emailUpdate.data.token;
  const changed = await call('PATCH', '/api/users/me/password', a.token, { currentPassword: password, newPassword: 'Changed@1234', confirmPassword: 'Changed@1234' });
  check(changed.status === 200 && changed.data.token, 'password change returns new session', changed);
  check((await call('GET', '/api/users/me/settings', a.token)).status === 401, 'password change invalidates old token');
  a.token = changed.data.token;
  check((await call('POST', '/api/auth/login', null, { username: a.username, password })).status === 401, 'old password no longer works');
  const relogin = await call('POST', '/api/auth/login', null, { username: a.username, password: 'Changed@1234' });
  check(relogin.status === 200, 'new password works');
  a.token = relogin.data.token;
  check((await call('GET', '/api/users/me/help', a.token)).status === 200, 'help exposes configured links and support endpoint');
  const ticket = await call('POST', '/api/users/me/support-requests', a.token, { type: 'bug', subject: 'Test', message: 'Test report', platform: 'android' });
  check(ticket.status === 201 && ticket.data.request.status === 'open', 'bug report saved with tracking id', ticket);
  return { pass, fail };
}

module.exports = { run };
