import { appendFileToFormData } from "@/utils/appendFileToFormData";

import { apiRequest } from "./api";

// ==========================================
// GROUPS (user-created group chats)
// ==========================================
// A group IS a chat: its id is the conversation id, so messages use the
// normal /api/chats/:id/... requests. These are the group-only ones.

export type GroupKind = "faction" | "open" | "private";
export type GroupJoinMode = "instant" | "approval";
export type GroupAudience = "members" | "admins";
export type GroupRole = "owner" | "admin" | "member";

export type GroupPerson = {
  id: string;
  username: string;
  name?: string | null;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
  faction?: string | null;
};

// mutedUntil: muted by an admin until then (shown to admins).
export type GroupMember = GroupPerson & {
  role: GroupRole;
  mutedUntil?: string | null;
};

export type Group = {
  id: string;
  name: string;
  description: string;
  photoUrl: string | null;
  kind: GroupKind;
  factionKey: string | null;
  factionName: string | null;
  joinMode: GroupJoinMode;
  sizeLimit: number;
  memberListVisibility: GroupAudience;
  whoCanAdd: GroupAudience;
  memberCount: number;
  createdBy: GroupPerson | null;
  createdAt?: string;
  myRole: GroupRole | null;
  canEdit: boolean;
  canAddPeople: boolean;
  canSeeMembers: boolean;
  inviteCode: string | null;
  inviteLink: string | null;
  pendingRequestCount: number;
  // Phase 3 (admins)
  bannedCount: number;
  slowModeSeconds: number;
  // Muted by an admin until then (I can read, not send).
  myMutedUntil: string | null;
};

// What someone who isn't in the group yet sees (Join / invite link).
export type GroupPreview = {
  id: string;
  name: string;
  description: string;
  photoUrl: string | null;
  kind: GroupKind;
  factionKey: string | null;
  joinMode: GroupJoinMode;
  memberCount: number;
  sizeLimit: number;
  isMember: boolean;
  requestPending: boolean;
};

export type JoinRequest = {
  id: string;
  user: GroupPerson;
  via: "link" | "join";
  createdAt: string;
};

export type SkipReason =
  | "not_found"
  | "already_member"
  | "unavailable"
  | "wrong_faction"
  | "group_full"
  | "banned";

export type Skipped = {
  userId?: string;
  username?: string | null;
  reason: SkipReason;
};

export const SKIP_REASON_TEXT: Record<SkipReason, string> = {
  not_found: "couldn't be found",
  already_member: "is already in the group",
  unavailable: "can't be added",
  wrong_faction: "is in another faction",
  group_full: "couldn't fit (the group is full)",
  banned: "is banned from this group (unban them first)",
};

// Slow mode choices (seconds; 0 = off).
export const SLOW_MODE_OPTIONS = [
  { value: "0", label: "Off" },
  { value: "10", label: "10s" },
  { value: "30", label: "30s" },
  { value: "60", label: "1m" },
  { value: "300", label: "5m" },
  { value: "3600", label: "1h" },
] as const;

export type MemberMuteDuration = "1h" | "1d" | "1w" | "forever";

export type GroupBanEntry = {
  user: GroupPerson;
  bannedBy: GroupPerson | null;
  reason: string;
  createdAt: string;
};

export type JoinResult = {
  joined: boolean;
  requested?: boolean;
  alreadyMember?: boolean;
  groupId?: string;
};

export type PhotoFile = { uri: string; name?: string; type?: string };

// ==========================================
// HELPERS
// ==========================================

function person(raw: any): GroupPerson {
  return {
    ...raw,
    id: String(raw?.id ?? raw?._id ?? ""),
    username: raw?.username || "",
  };
}

function normalizeGroup(raw: any): Group {
  return {
    ...raw,
    id: String(raw?.id ?? ""),
    description: raw?.description || "",
    photoUrl: raw?.photoUrl || null,
    createdBy: raw?.createdBy ? person(raw.createdBy) : null,
    pendingRequestCount: Number(raw?.pendingRequestCount) || 0,
    bannedCount: Number(raw?.bannedCount) || 0,
    slowModeSeconds: Number(raw?.slowModeSeconds) || 0,
    myMutedUntil: raw?.myMutedUntil || null,
  };
}

// The link people can share. The backend sends a full link when it knows
// the website's address; otherwise it's built from this app's own.
export function inviteLinkFor(group: Pick<Group, "inviteCode" | "inviteLink">) {
  if (group.inviteLink) {
    return group.inviteLink;
  }

  if (!group.inviteCode) {
    return null;
  }

  const base = (
    process.env.EXPO_PUBLIC_WEB_URL || "https://cosquest.vercel.app"
  ).replace(/\/$/, "");

  return `${base}/group/join/${group.inviteCode}`;
}

// Accepts a full invite link or just the code.
export function inviteCodeFrom(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/group\/join\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : trimmed;
}

async function groupForm(
  fields: Record<string, unknown>,
  photo?: PhotoFile | null,
) {
  if (!photo?.uri) {
    return fields;
  }

  const form = new FormData();

  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    form.append(
      key,
      Array.isArray(value) ? JSON.stringify(value) : String(value),
    );
  });

  await appendFileToFormData(form, "photo", {
    uri: photo.uri,
    name: photo.name || "group-photo.jpg",
    type: photo.type || "image/jpeg",
  });

  return form;
}

// ==========================================
// REQUESTS
// ==========================================

export async function createGroup(
  data: {
    name: string;
    description?: string;
    kind: GroupKind;
    factionKey?: string | null;
    joinMode?: GroupJoinMode;
    sizeLimit?: number;
    memberListVisibility?: GroupAudience;
    whoCanAdd?: GroupAudience;
    members?: string[];
  },
  photo: PhotoFile | null,
  token: string,
): Promise<{
  group: Group;
  chatId: string;
  added: string[];
  skipped: Skipped[];
}> {
  const response = await apiRequest<any>("/api/groups", {
    method: "POST",
    body: await groupForm(data, photo),
    token,
  });

  const group = normalizeGroup(response?.group);

  return {
    group,
    chatId: String(response?.chat?.id ?? group.id),
    added: response?.added || [],
    skipped: response?.skipped || [],
  };
}

export async function getGroup(
  groupId: string,
  token: string,
): Promise<{ group: Group | null; preview: GroupPreview | null }> {
  const response = await apiRequest<any>(
    `/api/groups/${encodeURIComponent(groupId)}`,
    { token },
  );

  return {
    group: response?.group ? normalizeGroup(response.group) : null,
    preview: response?.preview || null,
  };
}

export async function updateGroup(
  groupId: string,
  changes: Partial<{
    name: string;
    description: string;
    joinMode: GroupJoinMode;
    sizeLimit: number;
    memberListVisibility: GroupAudience;
    whoCanAdd: GroupAudience;
    slowModeSeconds: number;
    removePhoto: boolean;
  }>,
  photo: PhotoFile | null,
  token: string,
): Promise<Group> {
  const response = await apiRequest<any>(
    `/api/groups/${encodeURIComponent(groupId)}`,
    {
      method: "PATCH",
      body: await groupForm(changes, photo),
      token,
    },
  );

  return normalizeGroup(response?.group);
}

export async function getGroupMembers(
  groupId: string,
  options: { search?: string; page?: number },
  token: string,
): Promise<{ members: GroupMember[]; total: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options.search) params.set("search", options.search);
  if (options.page) params.set("page", String(options.page));
  params.set("limit", "50");

  const response = await apiRequest<any>(
    `/api/groups/${encodeURIComponent(groupId)}/members?${params.toString()}`,
    { token },
  );

  return {
    members: (response?.members || []).map((raw: any) => ({
      ...person(raw),
      role: raw?.role || "member",
      mutedUntil: raw?.mutedUntil || null,
    })),
    total: response?.pagination?.total ?? 0,
    hasMore: !!response?.pagination?.hasMore,
  };
}

export async function addGroupMembers(
  groupId: string,
  userIds: string[],
  token: string,
): Promise<{ group: Group; added: string[]; skipped: Skipped[] }> {
  const response = await apiRequest<any>(
    `/api/groups/${encodeURIComponent(groupId)}/members`,
    {
      method: "POST",
      body: { userIds },
      token,
    },
  );

  return {
    group: normalizeGroup(response?.group),
    added: response?.added || [],
    skipped: response?.skipped || [],
  };
}

export async function joinGroup(
  groupId: string,
  token: string,
): Promise<JoinResult> {
  return apiRequest<JoinResult>(
    `/api/groups/${encodeURIComponent(groupId)}/join`,
    {
      method: "POST",
      token,
    },
  );
}

export async function getInvite(
  code: string,
  token: string,
): Promise<GroupPreview> {
  const response = await apiRequest<any>(
    `/api/groups/invite/${encodeURIComponent(code)}`,
    { token },
  );
  return response?.preview;
}

export async function joinByInvite(
  code: string,
  token: string,
): Promise<JoinResult> {
  return apiRequest<JoinResult>(
    `/api/groups/invite/${encodeURIComponent(code)}/join`,
    {
      method: "POST",
      token,
    },
  );
}

export async function resetInviteLink(
  groupId: string,
  token: string,
): Promise<{ inviteCode: string | null; inviteLink: string | null }> {
  return apiRequest(
    `/api/groups/${encodeURIComponent(groupId)}/invite-link/reset`,
    {
      method: "POST",
      token,
    },
  );
}

export async function leaveGroup(groupId: string, token: string) {
  return apiRequest(`/api/groups/${encodeURIComponent(groupId)}/leave`, {
    method: "POST",
    token,
  });
}

export async function muteGroup(
  groupId: string,
  muted: boolean,
  duration: "8h" | "1w" | "always",
  token: string,
): Promise<{ muted: boolean; mutedUntil: string | null }> {
  return apiRequest(`/api/groups/${encodeURIComponent(groupId)}/mute`, {
    method: "PATCH",
    body: { muted, duration },
    token,
  });
}

export async function getJoinRequests(
  groupId: string,
  token: string,
): Promise<JoinRequest[]> {
  const response = await apiRequest<any>(
    `/api/groups/${encodeURIComponent(groupId)}/requests`,
    { token },
  );
  return (response?.requests || []).map((raw: any) => ({
    ...raw,
    id: String(raw?.id),
    user: person(raw?.user),
  }));
}

export async function answerJoinRequest(
  groupId: string,
  requestId: string,
  approve: boolean,
  token: string,
) {
  return apiRequest(
    `/api/groups/${encodeURIComponent(groupId)}/requests/${encodeURIComponent(requestId)}/${approve ? "approve" : "decline"}`,
    { method: "POST", token },
  );
}

export async function discoverGroups(
  search: string,
  token: string,
): Promise<GroupPreview[]> {
  const query = search.trim()
    ? `?search=${encodeURIComponent(search.trim())}`
    : "";
  const response = await apiRequest<any>(`/api/groups/discover${query}`, {
    token,
  });
  return response?.groups || [];
}

// ==========================================
// ADMINS (Phase 3)
// ==========================================
// Admins act on members; only the owner acts on admins; nobody acts on the
// owner. The backend checks this too.

export function canActOn(
  myRole: GroupRole | null | undefined,
  theirRole: GroupRole,
) {
  if (myRole !== "owner" && myRole !== "admin") return false;
  if (theirRole === "owner") return false;
  if (theirRole === "admin") return myRole === "owner";
  return true;
}

function memberPath(groupId: string, userId: string) {
  return `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`;
}

export async function setMemberRole(
  groupId: string,
  userId: string,
  role: "admin" | "member",
  token: string,
) {
  return apiRequest(`${memberPath(groupId, userId)}/role`, {
    method: "POST",
    body: { role },
    token,
  });
}

export async function removeMember(
  groupId: string,
  userId: string,
  token: string,
) {
  return apiRequest(`${memberPath(groupId, userId)}/remove`, {
    method: "POST",
    token,
  });
}

export async function banMember(
  groupId: string,
  userId: string,
  reason: string,
  token: string,
) {
  return apiRequest(`${memberPath(groupId, userId)}/ban`, {
    method: "POST",
    body: { reason },
    token,
  });
}

export async function muteMember(
  groupId: string,
  userId: string,
  duration: MemberMuteDuration,
  token: string,
) {
  return apiRequest<{ mutedUntil: string }>(
    `${memberPath(groupId, userId)}/mute`,
    {
      method: "POST",
      body: { duration },
      token,
    },
  );
}

export async function unmuteMember(
  groupId: string,
  userId: string,
  token: string,
) {
  return apiRequest(`${memberPath(groupId, userId)}/mute`, {
    method: "DELETE",
    token,
  });
}

export async function getBans(
  groupId: string,
  token: string,
): Promise<GroupBanEntry[]> {
  const response = await apiRequest<any>(
    `/api/groups/${encodeURIComponent(groupId)}/bans`,
    { token },
  );
  return (response?.bans || []).map((raw: any) => ({
    ...raw,
    user: person(raw?.user),
    bannedBy: raw?.bannedBy ? person(raw.bannedBy) : null,
  }));
}

export async function unbanMember(
  groupId: string,
  userId: string,
  token: string,
) {
  return apiRequest(
    `/api/groups/${encodeURIComponent(groupId)}/bans/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      token,
    },
  );
}

// "until 18:00", "until Mon 18:00", or "until an admin unmutes you".
export function mutedUntilText(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (date.getFullYear() - new Date().getFullYear() > 5)
    return "until an admin unmutes you";
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? `until ${time}`
    : `until ${date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}
