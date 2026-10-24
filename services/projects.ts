// ==========================================
// PROJECTS (group Projects tab · Figma · Projects)
// ==========================================
// A project belongs to a group chat and holds SUBJECTS ("Route & meetup",
// "Costumes"...). Each subject keeps its FILES (PDF, images, documents up to
// 25 MB) and its related SPARKS together.
//
// BACKEND (Emmanuel, commit cbb4005): the functions at the bottom call the
// real routes. While they answer "Route not found" (not deployed yet) the
// screens use the sample data below instead, so they work either way.
import { appendFileToFormData } from "@/utils/appendFileToFormData";

import { apiRequest } from "./api";
import { getGroupMembers, type GroupPerson } from "./groups";

export type ProjectFileKind = "pdf" | "image" | "doc" | "other";

export type ProjectFile = {
  id: string;
  subjectId: string;
  name: string;
  kind: ProjectFileKind;
  sizeBytes: number;
  url: string | null;
  uploadedBy: GroupPerson;
  createdAt: string;
};

export type ProjectSpark = {
  id: string;
  subjectId: string;
  subject: string;
  lastMessage: { author: GroupPerson; text: string } | null;
  people: number;
  active: boolean;
  lastActivityAt: string;
  // A file the conversation is about ("Meetup point.jpg").
  fileName: string | null;
};

export type ProjectSubject = {
  id: string;
  name: string;
  description: string;
  fileCount: number;
  sparkCount: number;
  latestFile: ProjectFile | null;
  latestSpark: ProjectSpark | null;
};

export type ProjectIcon = "sparkles" | "color-palette-outline" | "heart-outline" | "flag-outline" | "camera-outline";

export type Project = {
  id: string;
  conversationId: string;
  name: string;
  description: string;
  // "Chicano Park · Saturday, Oct 10" on the card.
  place: string | null;
  date: string | null;
  icon: ProjectIcon;
  archived: boolean;
  createdBy: GroupPerson;
  // A few faces for the card; memberCount for "24 group members".
  members: GroupPerson[];
  memberCount: number;
  subjects: ProjectSubject[];
  fileCount: number;
  sparkCount: number;
  // "Maya added a file · 12 min ago".
  lastActivity: { text: string; at: string } | null;
  createdAt: string;
  // From the server's project detail: may this person edit / archive it?
  canManage?: boolean;
};

export type SubjectDetail = { subject: ProjectSubject; files: ProjectFile[]; sparks: ProjectSpark[] };

export type NewProjectInput = { name: string; description: string; place?: string; date?: string | null; subjects: string[] };

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

// ---------------------------------------------------------------------
// Helpers for the screens
// ---------------------------------------------------------------------

export function fileKindOf(name: string, mimeType?: string | null): ProjectFileKind {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (mimeType?.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return "image";
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (["doc", "docx", "txt", "rtf", "odt", "xls", "xlsx", "ppt", "pptx", "csv"].includes(ext)) return "doc";
  return "other";
}

export function fileBadge(file: Pick<ProjectFile, "name" | "kind">) {
  const ext = file.name.split(".").pop()?.toUpperCase() || "";
  if (file.kind === "image") return ext === "JPEG" ? "JPG" : ext || "IMG";
  if (file.kind === "pdf") return "PDF";
  return ext.slice(0, 4) || "FILE";
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// "12 min ago", "Today, 9:32 AM", "Yesterday", "Oct 6"
export function formatWhen(iso: string, now = new Date()) {
  const at = new Date(iso);
  const minutes = Math.round((now.getTime() - at.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (at >= startOfToday) return `Today, ${time}`;
  if (at.getTime() >= startOfToday.getTime() - 86400000) return "Yesterday";
  return at.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export function countsLine(item: { fileCount: number; sparkCount: number; subjects?: unknown[] }) {
  const parts = [];
  if (item.subjects) parts.push(plural(item.subjects.length, "subject"));
  parts.push(plural(item.fileCount, "file"), plural(item.sparkCount, "Spark"));
  return parts.join(" · ");
}

// ---------------------------------------------------------------------
// SAMPLE DATA (until the backend is connected)
// ---------------------------------------------------------------------
const MAYA: GroupPerson = { id: "mock_maya", username: "maya", name: "Maya Chen" };
const DIEGO: GroupPerson = { id: "mock_diego", username: "diego", name: "Diego Ruiz" };
const LEO: GroupPerson = { id: "mock_leo", username: "leo", name: "Leo Park" };
const NIA: GroupPerson = { id: "mock_nia", username: "nia", name: "Nia Brooks" };
const SARTHAK: GroupPerson = { id: "mock_sarthak", username: "sarthak", name: "Sarthak" };

const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
const inDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
};

let seq = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

type Store = { projects: Project[]; files: ProjectFile[]; sparks: ProjectSpark[] };
const byChat = new Map<string, Store>();

function file(subjectId: string, name: string, sizeBytes: number, by: GroupPerson, minutesAgo: number): ProjectFile {
  return { id: nextId("file"), subjectId, name, kind: fileKindOf(name), sizeBytes, url: null, uploadedBy: by, createdAt: ago(minutesAgo) };
}

function spark(subjectId: string, subject: string, by: GroupPerson, text: string, people: number, minutesAgo: number, fileName: string | null = null): ProjectSpark {
  return {
    id: nextId("spark"),
    subjectId,
    subject,
    lastMessage: { author: by, text },
    people,
    active: minutesAgo < 60,
    lastActivityAt: ago(minutesAgo),
    fileName,
  };
}

function subjectRow(id: string, name: string, description: string): ProjectSubject {
  return { id, name, description, fileCount: 0, sparkCount: 0, latestFile: null, latestSpark: null };
}

function seed(conversationId: string): Store {
  const store: Store = { projects: [], files: [], sparks: [] };
  const project = (p: Omit<Project, "fileCount" | "sparkCount" | "conversationId" | "archived" | "createdAt">): Project => ({
    ...p,
    conversationId,
    archived: false,
    fileCount: 0,
    sparkCount: 0,
    createdAt: ago(60 * 24 * 7),
  });

  // Next CosQuest (the featured one in the design)
  const route = subjectRow(nextId("sub"), "Route & meetup", "The route, meeting point and plans for getting everyone to Chicano Park.");
  const costumes = subjectRow(nextId("sub"), "Costumes", "Costume ideas and who's wearing what on Saturday.");
  const supplies = subjectRow(nextId("sub"), "Supplies & roles", "What to bring and who's doing what.");
  store.projects.push(
    project({
      id: nextId("proj"),
      name: "Next CosQuest",
      description: "Our shared space for the mural walk, costume ideas and everything for Saturday.",
      place: "Chicano Park",
      date: inDays(3),
      icon: "sparkles",
      createdBy: SARTHAK,
      members: [SARTHAK, MAYA, DIEGO],
      memberCount: 24,
      subjects: [route, costumes, supplies],
      lastActivity: { text: "Maya added a file", at: ago(12) },
    }),
  );
  store.files.push(
    file(route.id, "Transit & parking.pdf", 680 * 1024, DIEGO, 60 * 26),
    file(route.id, "Chicano Park route.pdf", 2.4 * 1024 * 1024, SARTHAK, 90),
    file(route.id, "Meetup point.jpg", 1.2 * 1024 * 1024, MAYA, 12),
    file(costumes.id, "Spider-Man suit.jpg", 2.1 * 1024 * 1024, LEO, 60 * 30),
    file(costumes.id, "Fabric list.pdf", 300 * 1024, NIA, 60 * 5),
    file(costumes.id, "Costume inspiration.jpg", 1.8 * 1024 * 1024, LEO, 40),
    file(supplies.id, "Snack budget.xlsx", 45 * 1024, NIA, 60 * 30),
    file(supplies.id, "Saturday checklist.pdf", 840 * 1024, MAYA, 60 * 20),
  );
  store.sparks.push(
    spark(route.id, "Getting to Chicano Park", DIEGO, "The trolley stop is a short walk away.", 4, 60 * 22, "Transit & parking.pdf"),
    spark(route.id, "Meet by the mural?", MAYA, "Yes! Meet by the mural at 10?", 3, 9, "Meetup point.jpg"),
    spark(costumes.id, "Fabric run", NIA, "I'll grab the red fabric on Thursday.", 2, 60 * 6),
    spark(costumes.id, "Spider-Man uniform", LEO, "I can bring mine for Saturday.", 3, 7),
    spark(supplies.id, "Who's bringing what?", NIA, "I'll bring water for everyone.", 5, 60 * 21),
  );

  // More from the group
  const stories = ["Murals", "Voices", "Photos", "Map"].map((name) => subjectRow(nextId("sub"), name, ""));
  store.projects.push(
    project({
      id: nextId("proj"),
      name: "Barrio mural stories",
      description: "Document the art and voices of our barrio.",
      place: null,
      date: null,
      icon: "color-palette-outline",
      createdBy: DIEGO,
      members: [DIEGO, MAYA],
      memberCount: 24,
      subjects: stories,
      lastActivity: { text: "Diego updated", at: ago(60 * 23) },
    }),
  );
  stories.forEach((subject, index) => {
    for (let i = 0; i < 3; i++) store.files.push(file(subject.id, `${subject.name} ${i + 1}.jpg`, 900 * 1024, DIEGO, 60 * 24 * (index + 2) + i));
    if (index < 3) store.sparks.push(spark(subject.id, `${subject.name} ideas`, DIEGO, "Let's add more from the north wall.", 2, 60 * 24 * (index + 2)));
  });

  const food = ["Drop-off points", "Volunteers"].map((name) => subjectRow(nextId("sub"), name, ""));
  store.projects.push(
    project({
      id: nextId("proj"),
      name: "Community food drive",
      description: "Neighbors helping neighbors this fall.",
      place: null,
      date: null,
      icon: "heart-outline",
      createdBy: NIA,
      members: [NIA, LEO],
      memberCount: 24,
      subjects: food,
      lastActivity: { text: "Nia updated", at: ago(60 * 24 * 4) },
    }),
  );
  food.forEach((subject, index) => {
    for (let i = 0; i < 3; i++) store.files.push(file(subject.id, `${subject.name} ${i + 1}.pdf`, 500 * 1024, NIA, 60 * 24 * (index + 5) + i));
    for (let i = 0; i < 2; i++) store.sparks.push(spark(subject.id, `${subject.name} plan ${i + 1}`, NIA, "Sounds good to me.", 3, 60 * 24 * (index + 5) + i));
  });

  store.projects.forEach((p) => refresh(store, p));
  return store;
}

const newestFirst = <T extends { createdAt?: string; lastActivityAt?: string }>(a: T, b: T) =>
  new Date(b.createdAt || b.lastActivityAt || 0).getTime() - new Date(a.createdAt || a.lastActivityAt || 0).getTime();

// Recount a project's subjects (counts, newest file and Spark).
function refresh(store: Store, project: Project) {
  project.subjects = project.subjects.map((subject) => {
    const files = store.files.filter((f) => f.subjectId === subject.id).sort(newestFirst);
    const sparks = store.sparks
      .filter((s) => s.subjectId === subject.id)
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
    return { ...subject, fileCount: files.length, sparkCount: sparks.length, latestFile: files[0] || null, latestSpark: sparks[0] || null };
  });
  project.fileCount = project.subjects.reduce((n, s) => n + s.fileCount, 0);
  project.sparkCount = project.subjects.reduce((n, s) => n + s.sparkCount, 0);
}

function storeFor(conversationId: string) {
  let store = byChat.get(conversationId);
  if (!store) {
    store = seed(conversationId);
    byChat.set(conversationId, store);
  }
  return store;
}

function findProject(projectId: string): { store: Store; project: Project } {
  for (const store of byChat.values()) {
    const project = store.projects.find((p) => p.id === projectId);
    if (project) return { store, project };
  }
  throw new Error("Project not found.");
}

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const wait = () => new Promise((resolve) => setTimeout(resolve, 150));

// ---------------------------------------------------------------------
// THE FUNCTIONS THE SCREENS USE (sample data now; backend later)
// ---------------------------------------------------------------------

async function mockListProjects(conversationId: string, _token: string): Promise<Project[]> {
  await wait();
  return copy(storeFor(conversationId).projects);
}

async function mockGetProject(projectId: string, _token: string): Promise<Project> {
  await wait();
  return copy(findProject(projectId).project);
}

async function mockCreateProject(conversationId: string, input: NewProjectInput, me: GroupPerson, _token: string): Promise<Project> {
  await wait();
  const store = storeFor(conversationId);
  const project: Project = {
    id: nextId("proj"),
    conversationId,
    name: input.name.trim(),
    description: input.description.trim(),
    place: input.place?.trim() || null,
    date: input.date || null,
    icon: "flag-outline",
    archived: false,
    createdBy: me,
    members: [me],
    memberCount: store.projects[0]?.memberCount || 1,
    subjects: input.subjects.map((name) => subjectRow(nextId("sub"), name.trim(), "")).filter((s) => s.name),
    fileCount: 0,
    sparkCount: 0,
    lastActivity: { text: `${(me.name || me.username || "You").split(" ")[0]} created it`, at: new Date().toISOString() },
    createdAt: new Date().toISOString(),
  };
  store.projects.unshift(project);
  return copy(project);
}

async function mockSetProjectArchived(projectId: string, archived: boolean, _token: string): Promise<Project> {
  await wait();
  const { project } = findProject(projectId);
  project.archived = archived;
  return copy(project);
}

async function mockAddSubject(projectId: string, input: { name: string; description: string }, me: GroupPerson, _token: string): Promise<Project> {
  await wait();
  const { store, project } = findProject(projectId);
  project.subjects.push(subjectRow(nextId("sub"), input.name.trim(), input.description.trim()));
  project.lastActivity = { text: `${(me.name || me.username || "Someone").split(" ")[0]} added a subject`, at: new Date().toISOString() };
  refresh(store, project);
  return copy(project);
}

async function mockGetSubject(projectId: string, subjectId: string, _token: string): Promise<SubjectDetail> {
  await wait();
  const { store, project } = findProject(projectId);
  const subject = project.subjects.find((s) => s.id === subjectId);
  if (!subject) throw new Error("Subject not found.");
  return copy({
    subject,
    files: store.files.filter((f) => f.subjectId === subjectId).sort(newestFirst),
    sparks: store.sparks
      .filter((s) => s.subjectId === subjectId)
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()),
  });
}

export type PickedFile = { name: string; sizeBytes: number; mimeType?: string | null; uri: string };

async function mockUploadProjectFile(projectId: string, subjectId: string, picked: PickedFile, me: GroupPerson, _token: string): Promise<ProjectFile> {
  if (picked.sizeBytes > MAX_FILE_BYTES) throw new Error(`${picked.name} is over 25 MB.`);
  await wait();
  const { store, project } = findProject(projectId);
  const added: ProjectFile = {
    id: nextId("file"),
    subjectId,
    name: picked.name,
    kind: fileKindOf(picked.name, picked.mimeType),
    sizeBytes: picked.sizeBytes,
    url: picked.uri,
    uploadedBy: me,
    createdAt: new Date().toISOString(),
  };
  store.files.push(added);
  project.lastActivity = { text: `${(me.name || me.username || "Someone").split(" ")[0]} added a file`, at: added.createdAt };
  refresh(store, project);
  return copy(added);
}

// =====================================================================
// THE FUNCTIONS THE SCREENS USE - Emmanuel's backend (commit cbb4005)
// =====================================================================
//   GET    /api/groups/:groupId/projects?status=active|archived
//   POST   /api/groups/:groupId/projects        { name, description, location, dueAt, subjects }
//   GET    /api/projects/:projectId             { project, files, sparks, upcomingCalls }
//   PATCH  /api/projects/:projectId             { archived }
//   POST   /api/projects/:projectId/subjects    { name, description }
//   POST   /api/projects/:projectId/subjects/:subjectId/files   multipart "file"
//   POST   /api/projects/:projectId/sparks      { sparkId, subjectId, fileId }
// People come as ids only: names come from the group's member list.
// Projects are for groups people create; the server refuses other rooms.
let mockOnly = false;

export function usingProjectsMock() {
  return mockOnly;
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String((error as any).message || "");
  return "";
}

async function withFallback<T>(real: () => Promise<T>, mock: () => Promise<T>): Promise<T> {
  if (mockOnly) return mock();
  try {
    return await real();
  } catch (error) {
    if (/^Route not found/i.test(messageOf(error))) {
      mockOnly = true;
      return mock();
    }
    throw error;
  }
}

// ---------- names (the group's members, once per group) ----------
type Members = { people: Map<string, GroupPerson>; total: number };
const membersByChat = new Map<string, Promise<Members>>();

function membersOf(conversationId: string, token: string): Promise<Members> {
  let pending = membersByChat.get(conversationId);
  if (!pending) {
    pending = getGroupMembers(conversationId, { limit: 100 }, token)
      .then((result) => ({
        people: new Map(result.members.map((member) => [member.id, member as GroupPerson])),
        total: result.total || result.members.length,
      }))
      .catch(() => {
        membersByChat.delete(conversationId);
        return { people: new Map<string, GroupPerson>(), total: 0 };
      });
    membersByChat.set(conversationId, pending);
  }
  return pending;
}

const who = (members: Members, id: unknown, name?: string | null): GroupPerson =>
  members.people.get(String(id || "")) || { id: String(id || ""), username: "", name: name || "Member" };

const KIND_LABELS: Record<string, string> = {
  image: "Sent a photo",
  video: "Sent a video",
  audio: "Sent a voice note",
  file: "Sent a file",
  album: "Sent photos",
  sticker: "Sent a sticker",
  poll: "Sent a poll",
};

function toFile(raw: any, members: Members): ProjectFile {
  const name = raw?.fileName || "File";
  return {
    id: String(raw?.id || ""),
    subjectId: raw?.subjectId ? String(raw.subjectId) : "",
    name,
    kind: fileKindOf(name, raw?.mimeType),
    sizeBytes: Number(raw?.sizeBytes) || 0,
    url: raw?.url || null,
    uploadedBy: who(members, raw?.uploadedBy),
    createdAt: raw?.createdAt || new Date().toISOString(),
  };
}

function toSpark(raw: any, members: Members, files: ProjectFile[]): ProjectSpark {
  const latest = raw?.latestMessage;
  return {
    id: String(raw?.id || ""),
    subjectId: raw?.subjectId ? String(raw.subjectId) : "",
    subject: raw?.subject || "Spark",
    lastMessage: latest
      ? { author: who(members, latest.senderId, latest.senderName), text: latest.text || KIND_LABELS[latest.kind] || "Sent a message" }
      : null,
    people: Number(raw?.participantCount) || 0,
    active: Boolean(raw?.active),
    lastActivityAt: raw?.lastActivityAt || latest?.createdAt || new Date().toISOString(),
    fileName: raw?.fileId ? files.find((file) => file.id === String(raw.fileId))?.name || null : null,
  };
}

function toProject(raw: any, members: Members, detail?: { files: ProjectFile[]; sparks: ProjectSpark[] }): Project {
  const creator = who(members, raw?.createdBy);
  const others = [...members.people.values()].filter((person) => person.id !== creator.id);
  const subjects: ProjectSubject[] = (raw?.subjects || []).map((subject: any) => {
    const id = String(subject?.id || "");
    const files = (detail?.files || []).filter((file) => file.subjectId === id);
    const sparks = (detail?.sparks || [])
      .filter((spark) => spark.subjectId === id)
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
    return {
      id,
      name: subject?.name || "Subject",
      description: subject?.description || "",
      fileCount: files.length,
      sparkCount: sparks.length,
      latestFile: files[0] || null,
      latestSpark: sparks[0] || null,
    };
  });
  return {
    id: String(raw?.id || ""),
    conversationId: String(raw?.conversationId || ""),
    name: raw?.name || "Project",
    description: raw?.description || "",
    place: raw?.location || null,
    date: raw?.dueAt || null,
    icon: "sparkles",
    archived: Boolean(raw?.archived),
    createdBy: creator,
    members: [creator, ...others].slice(0, 3),
    memberCount: members.total || 1,
    subjects,
    fileCount: Number(raw?.fileCount) || 0,
    sparkCount: Number(raw?.sparkCount) || 0,
    lastActivity: raw?.updatedAt ? { text: "Updated", at: raw.updatedAt } : null,
    createdAt: raw?.updatedAt || new Date().toISOString(),
    canManage: raw?.canManage,
  };
}

// The project detail, turned into the screens' shapes (shared by a project
// and its subjects).
async function projectDetail(projectId: string, token: string) {
  const r = await apiRequest<any>(`/api/projects/${encodeURIComponent(projectId)}`, { token });
  const members = await membersOf(String(r?.project?.conversationId || ""), token);
  const files = (r?.files || []).map((file: any) => toFile(file, members));
  const sparks = (r?.sparks || []).map((spark: any) => toSpark(spark, members, files));
  return { project: toProject(r?.project, members, { files, sparks }), files, sparks };
}

export async function listProjects(conversationId: string, token: string): Promise<Project[]> {
  return withFallback(
    async () => {
      const base = `/api/groups/${encodeURIComponent(conversationId)}/projects`;
      const [active, archived, members] = await Promise.all([
        apiRequest<any>(`${base}?status=active`, { token }),
        apiRequest<any>(`${base}?status=archived`, { token }),
        membersOf(conversationId, token),
      ]);
      return [...(active?.projects || []), ...(archived?.projects || [])].map((raw: any) => toProject(raw, members));
    },
    () => mockListProjects(conversationId, token),
  );
}

export async function getProject(projectId: string, token: string): Promise<Project> {
  return withFallback(async () => (await projectDetail(projectId, token)).project, () => mockGetProject(projectId, token));
}

export async function getSubject(projectId: string, subjectId: string, token: string): Promise<SubjectDetail> {
  return withFallback(
    async () => {
      const { project, files, sparks } = await projectDetail(projectId, token);
      const subject = project.subjects.find((item) => item.id === subjectId);
      if (!subject) throw new Error("Subject not found in this project.");
      return {
        subject,
        files: files.filter((file: ProjectFile) => file.subjectId === subjectId),
        sparks: sparks
          .filter((spark: ProjectSpark) => spark.subjectId === subjectId)
          .sort((a: ProjectSpark, b: ProjectSpark) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()),
      };
    },
    () => mockGetSubject(projectId, subjectId, token),
  );
}

export async function createProject(conversationId: string, input: NewProjectInput, me: GroupPerson, token: string): Promise<Project> {
  return withFallback(
    async () => {
      const r = await apiRequest<any>(`/api/groups/${encodeURIComponent(conversationId)}/projects`, {
        method: "POST",
        token,
        body: {
          name: input.name.trim(),
          description: input.description.trim(),
          location: input.place?.trim() || "",
          dueAt: input.date || null,
          subjects: input.subjects.map((name) => name.trim()).filter(Boolean).map((name) => ({ name })),
        },
      });
      return toProject(r?.project, await membersOf(conversationId, token));
    },
    () => mockCreateProject(conversationId, input, me, token),
  );
}

export async function setProjectArchived(projectId: string, archived: boolean, token: string): Promise<Project> {
  return withFallback(
    async () => {
      await apiRequest<any>(`/api/projects/${encodeURIComponent(projectId)}`, { method: "PATCH", token, body: { archived } });
      return (await projectDetail(projectId, token)).project;
    },
    () => mockSetProjectArchived(projectId, archived, token),
  );
}

export async function addSubject(projectId: string, input: { name: string; description: string }, me: GroupPerson, token: string): Promise<Project> {
  return withFallback(
    async () => {
      await apiRequest<any>(`/api/projects/${encodeURIComponent(projectId)}/subjects`, {
        method: "POST",
        token,
        body: { name: input.name.trim(), description: input.description.trim() },
      });
      return (await projectDetail(projectId, token)).project;
    },
    () => mockAddSubject(projectId, input, me, token),
  );
}

export async function uploadProjectFile(projectId: string, subjectId: string, picked: PickedFile, me: GroupPerson, token: string): Promise<ProjectFile> {
  if (picked.sizeBytes > MAX_FILE_BYTES) throw new Error(`${picked.name} is over 25 MB.`);
  return withFallback(
    async () => {
      const form = new FormData();
      await appendFileToFormData(form, "file", { uri: picked.uri, name: picked.name, type: picked.mimeType || undefined });
      const r = await apiRequest<any>(
        `/api/projects/${encodeURIComponent(projectId)}/subjects/${encodeURIComponent(subjectId)}/files`,
        { method: "POST", token, body: form },
      );
      const members: Members = { people: new Map([[me.id, me]]), total: 0 };
      return toFile(r?.file, members);
    },
    () => mockUploadProjectFile(projectId, subjectId, picked, me, token),
  );
}

// "+ Start Spark" on a subject: link one of the group's Sparks to it.
export async function linkProjectSpark(projectId: string, subjectId: string, sparkId: string, token: string): Promise<void> {
  await apiRequest<any>(`/api/projects/${encodeURIComponent(projectId)}/sparks`, {
    method: "POST",
    token,
    body: { sparkId, subjectId },
  });
}
