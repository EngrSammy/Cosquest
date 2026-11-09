const crypto = require('crypto');
const fs = require('fs');
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const ConversationMember = require('../models/ConversationMember');
const GroupJoinRequest = require('../models/GroupJoinRequest');
const GroupBan = require('../models/GroupBan');
const User = require('../models/User');
const notificationModel = require('../models/notificationModel');
const { isValidFactionKey, getFaction } = require('../models/factionModel');
const { storeChatMedia } = require('../utils/imageHost');
const { appLink } = require('../utils/shareLinks');
const { isBlockedEitherWay } = require('./publicProfileController');
const {
  summarizeConversation,
  userPreview,
  isGroupMember,
  countGroupMembers,
  groupRoleOf,
  canActOn,
  GROUP_ROLES,
  SENDER_FIELDS,
} = require('./chatController');
const { emitToUsers } = require('../realtime/socket');

const KINDS = ['faction', 'open', 'private'];
const JOIN_MODES = ['instant', 'approval'];
const VISIBILITY = ['members', 'admins'];
const MAX_PEOPLE_PER_REQUEST = 50;
const DEFAULT_SIZE_LIMIT = 256;
const MAX_SIZE_LIMIT = 1024;
const MUTE_DURATIONS = {
  '8h': 8 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  always: 100 * 365 * 24 * 60 * 60 * 1000,
};
// Admins muting a member (they can read, not send).
const MEMBER_MUTE_DURATIONS = {
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  forever: 100 * 365 * 24 * 60 * 60 * 1000,
};
const SLOW_MODE_VALUES = [0, 10, 30, 60, 300, 3600];

// ==========================================================================
// HELPERS
// ==========================================================================

function cleanUpLocalFile(file) {
  if (file?.path) fs.unlink(file.path, () => {});
}

function idOf(value) {
  return String(value?._id || value || '');
}

function isAdminRole(role) {
  return role === 'owner' || role === 'admin';
}

function newInviteCode() {
  return crypto.randomBytes(9).toString('base64url');
}

// Multipart forms send everything as text: accept JSON arrays, comma lists
// or real arrays.
function parseList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || !value.trim()) return [];
  const text = value.trim();
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return text.split(',').map((item) => item.trim()).filter(Boolean);
}

async function loadGroup(groupId) {
  if (!mongoose.isValidObjectId(groupId)) return null;
  const conversation = await Conversation.findById(groupId);
  if (!conversation || conversation.type !== 'group' || conversation.group?.archived) return null;
  return conversation;
}

// My role in this group: owner / admin / member, or null if I'm not in it.
// Faction groups count everyone in that faction as a member.
async function roleIn(conversation, user) {
  const row = await ConversationMember.findOne({ conversation: conversation._id, user: user._id });
  if (row && GROUP_ROLES.includes(row.role)) return { role: row.role, row };
  if (
    conversation.group?.kind === 'faction' &&
    user.faction &&
    user.faction === conversation.factionKey &&
    !(await GroupBan.exists({ conversation: conversation._id, user: user._id }))
  ) {
    return { role: 'member', row };
  }
  return { role: null, row };
}

function canSeeMembers(group, role) {
  if (!role) return false;
  return group.memberListVisibility === 'members' || isAdminRole(role);
}

function canAddPeople(group, role) {
  if (!role) return false;
  return group.whoCanAdd === 'members' || isAdminRole(role);
}

function inviteInfo(group) {
  if (!group.inviteCode) return { inviteCode: null, inviteLink: null };
  return { inviteCode: group.inviteCode, inviteLink: appLink(`/group/join/${group.inviteCode}`) };
}

async function groupJson(conversation, me, role) {
  const group = conversation.group;
  const admin = isAdminRole(role);
  const [memberCount, creator, pendingRequests, bannedCount, myRow] = await Promise.all([
    countGroupMembers(conversation),
    User.findById(group.createdBy).select(SENDER_FIELDS),
    admin ? GroupJoinRequest.countDocuments({ conversation: conversation._id, status: 'pending' }) : 0,
    admin ? GroupBan.countDocuments({ conversation: conversation._id }) : 0,
    ConversationMember.findOne({ conversation: conversation._id, user: me._id }, 'mutedByAdminUntil'),
  ]);
  const now = new Date();

  return {
    id: idOf(conversation),
    name: group.name,
    description: group.description || '',
    photoUrl: group.photoUrl || null,
    kind: group.kind,
    scope: group.scope || 'local',
    factionKey: conversation.factionKey || null,
    factionName: conversation.factionKey ? getFaction(conversation.factionKey)?.name || null : null,
    joinMode: group.joinMode,
    sizeLimit: group.sizeLimit,
    memberListVisibility: group.memberListVisibility,
    whoCanAdd: group.whoCanAdd,
    memberCount,
    createdBy: creator ? userPreview(creator) : null,
    createdAt: conversation.createdAt,
    myRole: role,
    canEdit: admin,
    canAddPeople: canAddPeople(group, role),
    canSeeMembers: canSeeMembers(group, role),
    // Only people who can add others get the invite link.
    ...(canAddPeople(group, role) ? inviteInfo(group) : { inviteCode: null, inviteLink: null }),
    pendingRequestCount: pendingRequests,
    bannedCount,
    slowModeSeconds: group.slowModeSeconds || 0,
    myMutedUntil: myRow?.mutedByAdminUntil && myRow.mutedByAdminUntil > now ? myRow.mutedByAdminUntil : null,
  };
}

// Tells members something changed (the app refetches the chat / group info).
async function broadcastGroupChange(conversation, extraUserIds = []) {
  const rows = await ConversationMember.find(
    { conversation: conversation._id, role: { $in: GROUP_ROLES } },
    'user'
  );
  const ids = [...new Set([...rows.map((row) => String(row.user)), ...extraUserIds.map(String)])];
  if (!ids.length) return;
  emitToUsers(ids, 'group:updated', { conversationId: idOf(conversation) });
  emitToUsers(ids, 'chat:preview', { conversationId: idOf(conversation) });
}

// Find people by ids and/or usernames.
async function findPeople(userIds, usernames) {
  const skipped = [];
  const found = new Map();

  const validIds = userIds.filter((id) => mongoose.isValidObjectId(id));
  userIds.filter((id) => !mongoose.isValidObjectId(id)).forEach((id) => skipped.push({ userId: id, reason: 'not_found' }));

  if (validIds.length) {
    const users = await User.find({ _id: { $in: validIds }, onboardingComplete: true });
    users.forEach((user) => found.set(String(user._id), user));
    validIds
      .filter((id) => !found.has(String(id)))
      .forEach((id) => skipped.push({ userId: id, reason: 'not_found' }));
  }

  for (const raw of usernames) {
    const name = String(raw).trim().replace(/^@/, '');
    if (!name) continue;
    const user = await User.findOne({
      onboardingComplete: true,
      'profile.username': new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (user) found.set(String(user._id), user);
    else skipped.push({ username: name, reason: 'not_found' });
  }

  return { users: [...found.values()], skipped };
}

// Adds people to a group (they get a notification and the group shows up in
// their chat list). Returns { added, skipped }.
async function addPeopleToGroup(conversation, adder, users) {
  const group = conversation.group;
  const added = [];
  const skipped = [];
  let count = await countGroupMembers(conversation);

  for (const user of users) {
    const userId = String(user._id);
    const username = user.profile?.username || null;

    if (userId === String(adder._id)) continue;

    if (await isGroupMember(conversation, user)) {
      skipped.push({ userId, username, reason: 'already_member' });
      continue;
    }
    if (await isBlockedEitherWay(adder._id, user._id)) {
      skipped.push({ userId, username, reason: 'unavailable' });
      continue;
    }
    if (await GroupBan.exists({ conversation: conversation._id, user: user._id })) {
      skipped.push({ userId, username, reason: 'banned' });
      continue;
    }
    if (group.kind === 'faction' && user.faction !== conversation.factionKey) {
      skipped.push({ userId, username, reason: 'wrong_faction' });
      continue;
    }
    if (group.kind !== 'faction' && count >= group.sizeLimit) {
      skipped.push({ userId, username, reason: 'group_full' });
      continue;
    }

    await ConversationMember.updateOne(
      { conversation: conversation._id, user: user._id },
      { $set: { role: 'member', joinedAt: new Date(), addedBy: adder._id }, $setOnInsert: { lastReadAt: new Date(0) } },
      { upsert: true }
    );
    // Any open join request is answered by being added.
    await GroupJoinRequest.updateMany(
      { conversation: conversation._id, user: user._id, status: 'pending' },
      { $set: { status: 'approved', decidedBy: adder._id, decidedAt: new Date() } }
    );

    count += 1;
    added.push(userId);

    const adderName = adder.profile?.username || 'Someone';
    notificationModel
      .createForUser(user._id, `${adderName} added you to ${group.name}`, {
        type: 'group',
        actor: adder._id,
        conversation: conversation._id,
      })
      .catch((error) => console.error('[groups] add notification failed:', error.message));
  }

  if (added.length) {
    emitToUsers(added, 'chat:preview', { conversationId: idOf(conversation) });
  }

  return { added, skipped };
}

// Joining (Join button or invite link): straight in, or a request for an admin.
// The introduction someone writes when asking to join, max 200 characters.
function introOf(req) {
  return typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 200) : '';
}

async function joinOrRequest(conversation, user, via, message = '') {
  const group = conversation.group;

  if (await isGroupMember(conversation, user)) {
    return { status: 200, body: { joined: true, alreadyMember: true } };
  }
  if (await GroupBan.exists({ conversation: conversation._id, user: user._id })) {
    return { status: 403, body: { error: "You can't join this group." } };
  }
  if (group.kind === 'faction' && user.faction !== conversation.factionKey) {
    return { status: 403, body: { error: 'This group is for another faction.' } };
  }
  if (group.kind !== 'faction' && (await countGroupMembers(conversation)) >= group.sizeLimit) {
    return { status: 409, body: { error: 'This group is full.' } };
  }

  if (group.joinMode === 'approval') {
    let request;
    try {
      request = await GroupJoinRequest.findOneAndUpdate(
        { conversation: conversation._id, user: user._id, status: 'pending' },
        { $setOnInsert: { via }, ...(message ? { $set: { message } } : {}) },
        { upsert: true, new: true }
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
      request = await GroupJoinRequest.findOne({ conversation: conversation._id, user: user._id, status: 'pending' });
    }

    // Tell the admins.
    const admins = await ConversationMember.find(
      { conversation: conversation._id, role: { $in: ['owner', 'admin'] } },
      'user'
    );
    const name = user.profile?.username || 'Someone';
    for (const admin of admins) {
      notificationModel
        .createForUser(admin.user, `${name} asked to join ${group.name}`, {
          type: 'group',
          actor: user._id,
          conversation: conversation._id,
        })
        .catch(() => {});
    }
    emitToUsers(admins.map((admin) => String(admin.user)), 'group:updated', { conversationId: idOf(conversation) });

    return { status: 202, body: { joined: false, requested: true, requestId: idOf(request) } };
  }

  await ConversationMember.updateOne(
    { conversation: conversation._id, user: user._id },
    { $set: { role: 'member', joinedAt: new Date(), addedBy: null }, $setOnInsert: { lastReadAt: new Date(0) } },
    { upsert: true }
  );
  await broadcastGroupChange(conversation, [user._id]);

  return { status: 200, body: { joined: true } };
}

// The group as seen by someone who isn't in it yet (Join screen / invite link).
async function groupPreview(conversation, user) {
  const group = conversation.group;
  const [memberCount, pending, member] = await Promise.all([
    countGroupMembers(conversation),
    GroupJoinRequest.exists({ conversation: conversation._id, user: user._id, status: 'pending' }),
    isGroupMember(conversation, user),
  ]);
  return {
    id: idOf(conversation),
    name: group.name,
    description: group.description || '',
    photoUrl: group.photoUrl || null,
    kind: group.kind,
    scope: group.scope || 'local',
    factionKey: conversation.factionKey || null,
    joinMode: group.joinMode,
    memberCount,
    sizeLimit: group.sizeLimit,
    isMember: member,
    requestPending: Boolean(pending),
  };
}

// ==========================================================================
// ENDPOINTS
// ==========================================================================

// POST /api/groups (multipart: optional `photo`)
// Body: name, description?, kind (faction|open|private), factionKey? (faction
// groups: your own faction), joinMode?, sizeLimit?, memberListVisibility?,
// whoCanAdd?, members? (user ids), memberUsernames?
async function createGroup(req, res) {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const kind = body.kind;

  const fail = (status, error) => {
    cleanUpLocalFile(req.file);
    return res.status(status).json({ error });
  };

  if (!name || name.length > 80) return fail(400, 'Give the group a name (up to 80 characters).');
  if (description.length > 500) return fail(400, 'The description can be up to 500 characters.');
  if (!KINDS.includes(kind)) return fail(400, 'kind must be faction, open or private.');

  let factionKey = null;
  if (kind === 'faction') {
    factionKey = body.factionKey || req.user.faction;
    if (!isValidFactionKey(factionKey)) return fail(400, 'Choose a valid faction.');
    if (factionKey !== req.user.faction) return fail(403, 'You can only create a faction group for your own faction.');
  }

  const joinMode = JOIN_MODES.includes(body.joinMode) ? body.joinMode : kind === 'private' ? 'approval' : 'instant';
  const sizeLimit = Math.min(MAX_SIZE_LIMIT, Math.max(2, Number(body.sizeLimit) || DEFAULT_SIZE_LIMIT));
  const memberListVisibility = VISIBILITY.includes(body.memberListVisibility) ? body.memberListVisibility : 'members';
  const whoCanAdd = VISIBILITY.includes(body.whoCanAdd) ? body.whoCanAdd : 'admins';

  const memberIds = parseList(body.members);
  const memberUsernames = parseList(body.memberUsernames);
  if (memberIds.length + memberUsernames.length > MAX_PEOPLE_PER_REQUEST) {
    return fail(400, `You can add up to ${MAX_PEOPLE_PER_REQUEST} people at a time.`);
  }

  let photoUrl = null;
  if (req.file) {
    const stored = await storeChatMedia(req.file, 'image');
    photoUrl = stored.url;
  }

  const conversation = await Conversation.create({
    type: 'group',
    factionKey,
    group: {
      name,
      description,
      photoUrl,
      kind,
      createdBy: req.user._id,
      joinMode,
      sizeLimit,
      memberListVisibility,
      whoCanAdd,
      inviteCode: newInviteCode(),
    },
  });

  await ConversationMember.updateOne(
    { conversation: conversation._id, user: req.user._id },
    { $set: { role: 'owner', joinedAt: new Date(), lastReadAt: new Date() } },
    { upsert: true }
  );

  const { users, skipped: notFound } = await findPeople(memberIds, memberUsernames);
  const { added, skipped } = await addPeopleToGroup(conversation, req.user, users);

  return res.status(201).json({
    chat: await summarizeConversation(conversation, req.user),
    group: await groupJson(conversation, req.user, 'owner'),
    added,
    skipped: [...notFound, ...skipped],
  });
}

// GET /api/groups/discover?search= - open community spaces (and faction
// groups for my faction) that I'm not in yet.
async function discoverGroups(req, res) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const filter = {
    type: 'group',
    'group.archived': { $ne: true },
    $or: [{ 'group.kind': 'open' }, ...(req.user.faction ? [{ 'group.kind': 'faction', factionKey: req.user.faction }] : [])],
  };
  if (search) {
    filter['group.name'] = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const conversations = await Conversation.find(filter).sort({ updatedAt: -1 }).limit(50);
  const myBans = await GroupBan.find({ user: req.user._id, conversation: { $in: conversations.map((c) => c._id) } }, 'conversation');
  const bannedFrom = new Set(myBans.map((ban) => String(ban.conversation)));
  const groups = [];
  for (const conversation of conversations) {
    if (bannedFrom.has(String(conversation._id))) continue;
    const preview = await groupPreview(conversation, req.user);
    if (!preview.isMember) groups.push(preview);
  }
  return res.json({ groups });
}

// GET /api/groups/:groupId - group info (members of the group), or a preview
// of an open group (so non-members can see what they'd join).
async function getGroup(req, res) {
  const conversation = await loadGroup(req.params.groupId);
  if (!conversation) return res.status(404).json({ error: 'Group not found.' });

  const { role } = await roleIn(conversation, req.user);
  if (!role) {
    if (conversation.group.kind === 'private') return res.status(404).json({ error: 'Group not found.' });
    return res.json({ group: null, preview: await groupPreview(conversation, req.user) });
  }
  return res.json({ group: await groupJson(conversation, req.user, role) });
}

// PATCH /api/groups/:groupId (multipart: optional `photo`) - admins only.
// Body: name?, description?, joinMode?, sizeLimit?, memberListVisibility?,
// whoCanAdd?, removePhoto? ("true")
async function updateGroup(req, res) {
  const fail = (status, error) => {
    cleanUpLocalFile(req.file);
    return res.status(status).json({ error });
  };

  const conversation = await loadGroup(req.params.groupId);
  if (!conversation) return fail(404, 'Group not found.');
  const { role } = await roleIn(conversation, req.user);
  if (!isAdminRole(role)) return fail(403, 'Only admins can change the group.');

  const body = req.body || {};
  const group = conversation.group;

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 80) return fail(400, 'Give the group a name (up to 80 characters).');
    group.name = name;
  }
  if (body.description !== undefined) {
    const description = String(body.description).trim();
    if (description.length > 500) return fail(400, 'The description can be up to 500 characters.');
    group.description = description;
  }
  if (body.joinMode !== undefined) {
    if (!JOIN_MODES.includes(body.joinMode)) return fail(400, 'joinMode must be instant or approval.');
    group.joinMode = body.joinMode;
  }
  if (body.memberListVisibility !== undefined) {
    if (!VISIBILITY.includes(body.memberListVisibility)) return fail(400, 'memberListVisibility must be members or admins.');
    group.memberListVisibility = body.memberListVisibility;
  }
  if (body.whoCanAdd !== undefined) {
    if (!VISIBILITY.includes(body.whoCanAdd)) return fail(400, 'whoCanAdd must be members or admins.');
    group.whoCanAdd = body.whoCanAdd;
  }
  if (body.slowModeSeconds !== undefined) {
    const seconds = Number(body.slowModeSeconds);
    if (!SLOW_MODE_VALUES.includes(seconds)) {
      return fail(400, `slowModeSeconds must be one of: ${SLOW_MODE_VALUES.join(', ')}.`);
    }
    group.slowModeSeconds = seconds;
  }
  if (body.sizeLimit !== undefined) {
    const sizeLimit = Number(body.sizeLimit);
    const count = await countGroupMembers(conversation);
    if (!Number.isInteger(sizeLimit) || sizeLimit < Math.max(2, count) || sizeLimit > MAX_SIZE_LIMIT) {
      return fail(400, `The size limit must be between ${Math.max(2, count)} and ${MAX_SIZE_LIMIT}.`);
    }
    group.sizeLimit = sizeLimit;
  }
  if (req.file) {
    const stored = await storeChatMedia(req.file, 'image');
    group.photoUrl = stored.url;
  } else if (body.removePhoto === true || body.removePhoto === 'true') {
    group.photoUrl = null;
  }

  conversation.markModified('group');
  await conversation.save();
  await broadcastGroupChange(conversation);

  return res.json({ group: await groupJson(conversation, req.user, role) });
}

// GET /api/groups/:groupId/members?search=&page=&limit=
async function listGroupMembers(req, res) {
  const conversation = await loadGroup(req.params.groupId);
  if (!conversation) return res.status(404).json({ error: 'Group not found.' });
  const { role } = await roleIn(conversation, req.user);
  if (!canSeeMembers(conversation.group, role)) {
    return res.status(403).json({ error: 'Only admins can see the member list of this group.' });
  }

  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const page = Math.min(1000, Math.max(1, Number(req.query.page) || 1));
  const search = typeof req.query.search === 'string' ? req.query.search.trim().replace(/^@/, '') : '';

  const rows = await ConversationMember.find(
    { conversation: conversation._id, role: { $in: GROUP_ROLES } },
    'user role joinedAt'
  );
  const roleByUser = new Map(rows.map((row) => [String(row.user), row.role]));

  const banned = (await GroupBan.find({ conversation: conversation._id }, 'user')).map((ban) => ban.user);
  const filter =
    conversation.group.kind === 'faction'
      ? {
          onboardingComplete: true,
          $or: [{ faction: conversation.factionKey }, { _id: { $in: rows.map((row) => row.user) } }],
          _id: { $nin: banned },
        }
      : { _id: { $in: rows.map((row) => row.user), $nin: banned } };
  if (search) {
    const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$and = [{ $or: [{ 'profile.username': pattern }, { 'profile.firstName': pattern }, { 'profile.lastName': pattern }, { 'profile.displayName': pattern }] }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).select(SENDER_FIELDS).sort({ 'profile.username': 1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);

  // Who's muted by an admin right now (shown to admins).
  const now = new Date();
  const mutedRows = isAdminRole(role)
    ? await ConversationMember.find(
        { conversation: conversation._id, user: { $in: users.map((user) => user._id) }, mutedByAdminUntil: { $gt: now } },
        'user mutedByAdminUntil'
      )
    : [];
  const mutedByUser = new Map(mutedRows.map((row) => [String(row.user), row.mutedByAdminUntil]));

  // Owner first, then admins, then everyone else.
  const order = { owner: 0, admin: 1, member: 2 };
  const members = users
    .map((user) => ({
      ...userPreview(user),
      role: roleByUser.get(String(user._id)) || 'member',
      mutedUntil: mutedByUser.get(String(user._id)) || null,
    }))
    .sort((a, b) => order[a.role] - order[b.role]);

  return res.json({ members, pagination: { page, limit, total, hasMore: page * limit < total } });
}

// POST /api/groups/:groupId/members - add people. Body: { userIds?, usernames? }
async function addGroupMembers(req, res) {
  const conversation = await loadGroup(req.params.groupId);
  if (!conversation) return res.status(404).json({ error: 'Group not found.' });
  const { role } = await roleIn(conversation, req.user);
  if (!canAddPeople(conversation.group, role)) {
    return res.status(403).json({ error: 'Only admins can add people to this group.' });
  }

  const userIds = parseList(req.body?.userIds);
  const usernames = parseList(req.body?.usernames);
  if (!userIds.length && !usernames.length) return res.status(400).json({ error: 'Choose at least one person to add.' });
  if (userIds.length + usernames.length > MAX_PEOPLE_PER_REQUEST) {
    return res.status(400).json({ error: `You can add up to ${MAX_PEOPLE_PER_REQUEST} people at a time.` });
  }

  const { users, skipped: notFound } = await findPeople(userIds, usernames);
  const { added, skipped } = await addPeopleToGroup(conversation, req.user, users);
  if (added.length) await broadcastGroupChange(conversation);

  return res.json({ group: await groupJson(conversation, req.user, role), added, skipped: [...notFound, ...skipped] });
}

// POST /api/groups/:groupId/join - the Join button (open groups, and faction
// groups for my faction).
async function joinGroup(req, res) {
  const conversation = await loadGroup(req.params.groupId);
  if (!conversation) return res.status(404).json({ error: 'Group not found.' });
  if (conversation.group.kind === 'private') {
    return res.status(403).json({ error: 'This group is invite only. Ask a member for the invite link.' });
  }
  const result = await joinOrRequest(conversation, req.user, 'join', introOf(req));
  return res.status(result.status).json(result.body);
}

// GET /api/groups/invite/:code - what the invite link opens.
async function getInvite(req, res) {
  const conversation = await Conversation.findOne({ type: 'group', 'group.inviteCode': String(req.params.code), 'group.archived': { $ne: true } });
  if (!conversation) return res.status(404).json({ error: 'This invite link is no longer valid.' });
  return res.json({ preview: await groupPreview(conversation, req.user) });
}

// POST /api/groups/invite/:code/join
async function joinByInvite(req, res) {
  const conversation = await Conversation.findOne({ type: 'group', 'group.inviteCode': String(req.params.code), 'group.archived': { $ne: true } });
  if (!conversation) return res.status(404).json({ error: 'This invite link is no longer valid.' });
  const result = await joinOrRequest(conversation, req.user, 'link', introOf(req));
  return res.status(result.status).json({ ...result.body, groupId: idOf(conversation) });
}

// POST /api/groups/:groupId/invite-link/reset - admins: the old link stops working.
async function resetInviteLink(req, res) {
  const conversation = await loadGroup(req.params.groupId);
  if (!conversation) return res.status(404).json({ error: 'Group not found.' });
  const { role } = await roleIn(conversation, req.user);
  if (!isAdminRole(role)) return res.status(403).json({ error: 'Only admins can reset the invite link.' });

  conversation.group.inviteCode = newInviteCode();
  conversation.markModified('group');
  await conversation.save();
  return res.json(inviteInfo(conversation.group));
}

// POST /api/groups/:groupId/leave
// If the owner leaves, the longest-serving admin (or member) becomes owner.
// When the last person leaves, the group is archived (hidden).
async function leaveGroup(req, res) {
  const conversation = await loadGroup(req.params.groupId);
  if (!conversation) return res.status(404).json({ error: 'Group not found.' });

  const { role, row } = await roleIn(conversation, req.user);
  if (!role) return res.status(400).json({ error: 'You are not in this group.' });

  const explicit = row && GROUP_ROLES.includes(row.role);
  if (!explicit) {
    // Pulled in by faction: you can't leave, only mute.
    return res.status(400).json({ error: "You're in this group because of your faction. You can mute it instead." });
  }

  await ConversationMember.updateOne({ _id: row._id }, { $set: { role: null } });

  if (role === 'owner') {
    const successor =
      (await ConversationMember.findOne({ conversation: conversation._id, role: 'admin' }).sort({ joinedAt: 1 })) ||
      (await ConversationMember.findOne({ conversation: conversation._id, role: 'member' }).sort({ joinedAt: 1 }));
    if (successor) {
      await ConversationMember.updateOne({ _id: successor._id }, { $set: { role: 'owner' } });
    } else if (conversation.group.kind !== 'faction') {
      conversation.group.archived = true;
      conversation.markModified('group');
      await conversation.save();
    }
  }

  await broadcastGroupChange(conversation, [req.user._id]);
  return res.json({ left: true });
}

// PATCH /api/groups/:groupId/mute - Body: { muted: true, duration: "8h"|"1w"|"always" } or { muted: false }
async function muteGroup(req, res) {
  const conversation = await loadGroup(req.params.groupId);
  if (!conversation) return res.status(404).json({ error: 'Group not found.' });
  const { role } = await roleIn(conversation, req.user);
  if (!role) return res.status(403).json({ error: 'You are not in this group.' });

  const muted = req.body?.muted === true || req.body?.muted === 'true';
  const duration = MUTE_DURATIONS[req.body?.duration] ? req.body.duration : 'always';
  const mutedUntil = muted ? new Date(Date.now() + MUTE_DURATIONS[duration]) : null;

  await ConversationMember.updateOne(
    { conversation: conversation._id, user: req.user._id },
    { $set: { mutedUntil }, $setOnInsert: { lastReadAt: new Date(0) } },
    { upsert: true }
  );
  return res.json({ muted, mutedUntil });
}

// GET /api/groups/:groupId/requests - admins: people waiting to join.
async function listJoinRequests(req, res) {
  const conversation = await loadGroup(req.params.groupId);
  if (!conversation) return res.status(404).json({ error: 'Group not found.' });
  const { role } = await roleIn(conversation, req.user);
  if (!isAdminRole(role)) return res.status(403).json({ error: 'Only admins can see join requests.' });

  const requests = await GroupJoinRequest.find({ conversation: conversation._id, status: 'pending' })
    .populate('user', SENDER_FIELDS)
    .sort({ createdAt: 1 })
    .limit(200);

  return res.json({
    requests: requests
      .filter((request) => request.user)
      .map((request) => ({
        id: idOf(request),
        user: userPreview(request.user),
        via: request.via,
        message: request.message || '',
        createdAt: request.createdAt,
      })),
  });
}

// POST /api/groups/:groupId/requests/:requestId/approve | /decline - admins.
async function decideJoinRequest(req, res) {
  const approve = req.params.decision === 'approve';
  if (!['approve', 'decline'].includes(req.params.decision)) return res.status(404).json({ error: 'Not found.' });

  const conversation = await loadGroup(req.params.groupId);
  if (!conversation) return res.status(404).json({ error: 'Group not found.' });
  const { role } = await roleIn(conversation, req.user);
  if (!isAdminRole(role)) return res.status(403).json({ error: 'Only admins can answer join requests.' });

  if (!mongoose.isValidObjectId(req.params.requestId)) return res.status(404).json({ error: 'Request not found.' });
  const request = await GroupJoinRequest.findOne({ _id: req.params.requestId, conversation: conversation._id, status: 'pending' });
  if (!request) return res.status(404).json({ error: 'This request was already answered.' });

  if (approve) {
    const user = await User.findById(request.user);
    if (!user) return res.status(404).json({ error: 'That person no longer exists.' });
    const { added, skipped } = await addPeopleToGroup(conversation, req.user, [user]);
    if (!added.length && skipped[0]?.reason !== 'already_member') {
      return res.status(409).json({ error: skipped[0]?.reason === 'group_full' ? 'This group is full.' : "That person can't be added." });
    }
    await broadcastGroupChange(conversation);
  } else {
    request.status = 'declined';
    request.decidedBy = req.user._id;
    request.decidedAt = new Date();
    await request.save();
  }

  return res.json({ approved: approve });
}

// ==========================================================================
// ADMINS (Phase 3)
// ==========================================================================
// Admins act on members; only the owner acts on admins; nobody acts on the
// owner (see canActOn in chatController).

// Loads the group, me (must be an admin) and the person I'm acting on.
async function loadModeration(req, res) {
  const conversation = await loadGroup(req.params.groupId);
  if (!conversation) {
    res.status(404).json({ error: 'Group not found.' });
    return null;
  }
  const actorRole = await groupRoleOf(conversation, req.user);
  if (!isAdminRole(actorRole)) {
    res.status(403).json({ error: 'Only admins can do this.' });
    return null;
  }
  if (!mongoose.isValidObjectId(req.params.userId)) {
    res.status(404).json({ error: 'Person not found.' });
    return null;
  }
  if (String(req.params.userId) === String(req.user._id)) {
    res.status(400).json({ error: "You can't do this to yourself." });
    return null;
  }
  const target = await User.findById(req.params.userId);
  if (!target) {
    res.status(404).json({ error: 'Person not found.' });
    return null;
  }
  const targetRole = await groupRoleOf(conversation, target);
  return { conversation, actorRole, target, targetRole };
}

function cannotActMessage(targetRole) {
  if (targetRole === 'owner') return "The group's owner can't be changed by admins.";
  if (targetRole === 'admin') return 'Only the owner can do this to an admin.';
  return "You can't do this.";
}

function notify(userId, actor, text, conversation) {
  notificationModel
    .createForUser(userId, text, { type: 'group', actor: actor._id, conversation: conversation?._id || null })
    .catch((error) => console.error('[groups] notification failed:', error.message));
}

// Tells the person's app to close the group (removed / banned).
function tellRemoved(conversation, userId, reason) {
  emitToUsers([String(userId)], 'group:removed', { conversationId: idOf(conversation), reason });
}

// POST /api/groups/:groupId/members/:userId/role  { role: "admin" | "member" }
// Admins can make members admins; only the owner can remove an admin.
async function setMemberRole(req, res) {
  const ctx = await loadModeration(req, res);
  if (!ctx) return;
  const { conversation, actorRole, target, targetRole } = ctx;

  const role = req.body?.role;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'role must be admin or member.' });
  if (!targetRole) return res.status(400).json({ error: 'This person is not in the group.' });
  if (targetRole === 'owner') return res.status(403).json({ error: cannotActMessage('owner') });
  if (role === 'member' && targetRole === 'admin' && actorRole !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can remove an admin.' });
  }
  if (targetRole === role) return res.json({ role });

  await ConversationMember.updateOne(
    { conversation: conversation._id, user: target._id },
    {
      $set: { role, ...(targetRole ? {} : { joinedAt: new Date() }) },
      $setOnInsert: { lastReadAt: new Date(0) },
    },
    { upsert: true }
  );

  if (role === 'admin') {
    notify(target._id, req.user, `${req.user.profile?.username || 'Someone'} made you an admin of ${conversation.group.name}`, conversation);
  }
  await broadcastGroupChange(conversation, [target._id]);
  return res.json({ role });
}

// POST /api/groups/:groupId/members/:userId/remove
// They can come back later (if invited / via the link). People in a faction
// group because of their faction can't be removed - ban them instead.
async function removeMember(req, res) {
  const ctx = await loadModeration(req, res);
  if (!ctx) return;
  const { conversation, actorRole, target, targetRole } = ctx;

  if (!targetRole) return res.status(400).json({ error: 'This person is not in the group.' });
  if (!canActOn(actorRole, targetRole)) return res.status(403).json({ error: cannotActMessage(targetRole) });

  const row = await ConversationMember.findOne({ conversation: conversation._id, user: target._id });
  if (!row || !GROUP_ROLES.includes(row.role)) {
    return res.status(400).json({
      error: "They're in this group because of their faction. Ban them to keep them out.",
      code: 'use_ban',
    });
  }

  await ConversationMember.updateOne({ _id: row._id }, { $set: { role: null, mutedByAdminUntil: null } });

  notify(target._id, req.user, `You were removed from ${conversation.group.name}`, null);
  tellRemoved(conversation, target._id, 'removed');
  await broadcastGroupChange(conversation);
  return res.json({ removed: true });
}

// POST /api/groups/:groupId/members/:userId/ban  { reason? }
// Removed, and can't come back until unbanned. Works on people who aren't in
// the group too (to keep them out).
async function banMember(req, res) {
  const ctx = await loadModeration(req, res);
  if (!ctx) return;
  const { conversation, actorRole, target, targetRole } = ctx;

  if (targetRole && !canActOn(actorRole, targetRole)) return res.status(403).json({ error: cannotActMessage(targetRole) });

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';
  await GroupBan.updateOne(
    { conversation: conversation._id, user: target._id },
    { $set: { bannedBy: req.user._id, reason } },
    { upsert: true }
  );
  await ConversationMember.updateOne(
    { conversation: conversation._id, user: target._id },
    { $set: { role: null, mutedByAdminUntil: null } }
  );
  await GroupJoinRequest.updateMany(
    { conversation: conversation._id, user: target._id, status: 'pending' },
    { $set: { status: 'declined', decidedBy: req.user._id, decidedAt: new Date() } }
  );

  if (targetRole) {
    notify(target._id, req.user, `You were removed from ${conversation.group.name}`, null);
    tellRemoved(conversation, target._id, 'banned');
  }
  await broadcastGroupChange(conversation);
  return res.json({ banned: true });
}

// GET /api/groups/:groupId/bans - admins.
async function listBans(req, res) {
  const conversation = await loadGroup(req.params.groupId);
  if (!conversation) return res.status(404).json({ error: 'Group not found.' });
  if (!isAdminRole(await groupRoleOf(conversation, req.user))) {
    return res.status(403).json({ error: 'Only admins can see banned people.' });
  }

  const bans = await GroupBan.find({ conversation: conversation._id })
    .populate('user', SENDER_FIELDS)
    .populate('bannedBy', SENDER_FIELDS)
    .sort({ createdAt: -1 })
    .limit(500);

  return res.json({
    bans: bans
      .filter((ban) => ban.user)
      .map((ban) => ({
        user: userPreview(ban.user),
        bannedBy: ban.bannedBy ? userPreview(ban.bannedBy) : null,
        reason: ban.reason || '',
        createdAt: ban.createdAt,
      })),
  });
}

// DELETE /api/groups/:groupId/bans/:userId - admins. They can be added or
// join again (faction groups: they're back in automatically).
async function unbanMember(req, res) {
  const conversation = await loadGroup(req.params.groupId);
  if (!conversation) return res.status(404).json({ error: 'Group not found.' });
  if (!isAdminRole(await groupRoleOf(conversation, req.user))) {
    return res.status(403).json({ error: 'Only admins can unban people.' });
  }
  if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ error: 'Person not found.' });

  await GroupBan.deleteOne({ conversation: conversation._id, user: req.params.userId });
  await broadcastGroupChange(conversation, [req.params.userId]);
  if (conversation.group.kind === 'faction') {
    emitToUsers([String(req.params.userId)], 'chat:preview', { conversationId: idOf(conversation) });
  }
  return res.json({ unbanned: true });
}

// POST /api/groups/:groupId/members/:userId/mute  { duration: "1h"|"1d"|"1w"|"forever" }
// They stay in the group and can read, but can't send until then.
async function muteMember(req, res) {
  const ctx = await loadModeration(req, res);
  if (!ctx) return;
  const { conversation, actorRole, target, targetRole } = ctx;

  if (!targetRole) return res.status(400).json({ error: 'This person is not in the group.' });
  if (!canActOn(actorRole, targetRole)) return res.status(403).json({ error: cannotActMessage(targetRole) });

  const duration = MEMBER_MUTE_DURATIONS[req.body?.duration] ? req.body.duration : '1h';
  const mutedUntil = new Date(Date.now() + MEMBER_MUTE_DURATIONS[duration]);

  await ConversationMember.updateOne(
    { conversation: conversation._id, user: target._id },
    { $set: { mutedByAdminUntil: mutedUntil, mutedBy: req.user._id }, $setOnInsert: { lastReadAt: new Date(0) } },
    { upsert: true }
  );

  notify(
    target._id,
    req.user,
    duration === 'forever'
      ? `An admin muted you in ${conversation.group.name}`
      : `An admin muted you in ${conversation.group.name} for ${{ '1h': '1 hour', '1d': '1 day', '1w': '1 week' }[duration]}`,
    conversation
  );
  await broadcastGroupChange(conversation, [target._id]);
  return res.json({ mutedUntil });
}

// DELETE /api/groups/:groupId/members/:userId/mute
async function unmuteMember(req, res) {
  const ctx = await loadModeration(req, res);
  if (!ctx) return;
  const { conversation, actorRole, target, targetRole } = ctx;

  if (targetRole && !canActOn(actorRole, targetRole)) return res.status(403).json({ error: cannotActMessage(targetRole) });

  await ConversationMember.updateOne(
    { conversation: conversation._id, user: target._id },
    { $set: { mutedByAdminUntil: null, mutedBy: null } }
  );
  await broadcastGroupChange(conversation, [target._id]);
  return res.json({ mutedUntil: null });
}

// DELETE /api/groups/:groupId/requests/mine - cancel my pending join request.
async function cancelMyRequest(req, res) {
  const conversation = await loadGroup(req.params.groupId);
  if (!conversation) return res.status(404).json({ error: 'Group not found.' });
  const result = await GroupJoinRequest.updateOne(
    { conversation: conversation._id, user: req.user._id, status: 'pending' },
    { $set: { status: 'cancelled', decidedAt: new Date() } }
  );
  const cancelled = result.modifiedCount > 0;
  // A private group stays hidden from people who never asked to join it (same
  // 404 as getGroup), so this can't be used to find out which ids are groups.
  if (!cancelled && conversation.group.kind === 'private') return res.status(404).json({ error: 'Group not found.' });
  if (cancelled) await broadcastGroupChange(conversation);
  return res.json({ cancelled });
}

module.exports = {
  cancelMyRequest,
  setMemberRole,
  removeMember,
  banMember,
  listBans,
  unbanMember,
  muteMember,
  unmuteMember,
  createGroup,
  discoverGroups,
  getGroup,
  updateGroup,
  listGroupMembers,
  addGroupMembers,
  joinGroup,
  getInvite,
  joinByInvite,
  resetInviteLink,
  leaveGroup,
  muteGroup,
  listJoinRequests,
  decideJoinRequest,
};
