// ==========================================
// PROJECTS (group Projects tab · Figma · Projects)
// ==========================================
// A project belongs to a group chat and holds SUBJECTS ("Route & meetup",
// "Costumes"...). Each subject keeps its FILES (PDF, images, documents up to
// 25 MB) and its related SPARKS together.
//
// SAMPLE DATA FOR NOW: Emmanuel's backend has project routes, but we haven't
// seen them yet. Every screen goes through the functions below (and the
// Redux slice), so connecting the backend later only changes this file.
import type { GroupPerson } from "./groups";

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

export async function listProjects(conversationId: string, _token: string): Promise<Project[]> {
  await wait();
  return copy(storeFor(conversationId).projects);
}

export async function getProject(projectId: string, _token: string): Promise<Project> {
  await wait();
  return copy(findProject(projectId).project);
}

export async function createProject(conversationId: string, input: NewProjectInput, me: GroupPerson, _token: string): Promise<Project> {
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

export async function setProjectArchived(projectId: string, archived: boolean, _token: string): Promise<Project> {
  await wait();
  const { project } = findProject(projectId);
  project.archived = archived;
  return copy(project);
}

export async function addSubject(projectId: string, input: { name: string; description: string }, me: GroupPerson, _token: string): Promise<Project> {
  await wait();
  const { store, project } = findProject(projectId);
  project.subjects.push(subjectRow(nextId("sub"), input.name.trim(), input.description.trim()));
  project.lastActivity = { text: `${(me.name || me.username || "Someone").split(" ")[0]} added a subject`, at: new Date().toISOString() };
  refresh(store, project);
  return copy(project);
}

export async function getSubject(projectId: string, subjectId: string, _token: string): Promise<SubjectDetail> {
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

export async function uploadProjectFile(projectId: string, subjectId: string, picked: PickedFile, me: GroupPerson, _token: string): Promise<ProjectFile> {
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
