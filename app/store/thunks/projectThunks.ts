// ==========================================
// PROJECTS - thunks (group Projects tab)
// ==========================================
// Each one calls services/projects.ts; the slice keeps the result, so the
// Projects tab, a project and its subjects share one copy.
import { createAsyncThunk } from "@reduxjs/toolkit";

import type { GroupPerson } from "@/services/groups";
import {
  addSubject,
  createProject,
  getProject,
  getSubject,
  linkProjectSpark,
  listProjects,
  setProjectArchived,
  uploadProjectFile,
  type NewProjectInput,
  type PickedFile,
  type Project,
  type ProjectFile,
  type SubjectDetail,
} from "@/services/projects";

function failed(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) return String((error as any).message || "") || fallback;
  return fallback;
}

export const fetchProjects = createAsyncThunk<
  { conversationId: string; projects: Project[] },
  { conversationId: string; token: string },
  { rejectValue: string }
>("projects/fetchForChat", async ({ conversationId, token }, { rejectWithValue }) => {
  try {
    return { conversationId, projects: await listProjects(conversationId, token) };
  } catch (error) {
    return rejectWithValue(failed(error, "Couldn't load projects."));
  }
});

export const fetchProject = createAsyncThunk<Project, { projectId: string; token: string }, { rejectValue: string }>(
  "projects/fetchOne",
  async ({ projectId, token }, { rejectWithValue }) => {
    try {
      return await getProject(projectId, token);
    } catch (error) {
      return rejectWithValue(failed(error, "Couldn't load this project."));
    }
  },
);

export const createProjectThunk = createAsyncThunk<
  Project,
  { conversationId: string; input: NewProjectInput; me: GroupPerson; token: string },
  { rejectValue: string }
>("projects/create", async ({ conversationId, input, me, token }, { rejectWithValue }) => {
  try {
    return await createProject(conversationId, input, me, token);
  } catch (error) {
    return rejectWithValue(failed(error, "Couldn't create the project."));
  }
});

export const archiveProjectThunk = createAsyncThunk<
  Project,
  { projectId: string; archived: boolean; token: string },
  { rejectValue: string }
>("projects/archive", async ({ projectId, archived, token }, { rejectWithValue }) => {
  try {
    return await setProjectArchived(projectId, archived, token);
  } catch (error) {
    return rejectWithValue(failed(error, "Couldn't update the project."));
  }
});

export const addSubjectThunk = createAsyncThunk<
  Project,
  { projectId: string; input: { name: string; description: string }; me: GroupPerson; token: string },
  { rejectValue: string }
>("projects/addSubject", async ({ projectId, input, me, token }, { rejectWithValue }) => {
  try {
    return await addSubject(projectId, input, me, token);
  } catch (error) {
    return rejectWithValue(failed(error, "Couldn't add the subject."));
  }
});

export const fetchSubject = createAsyncThunk<
  { projectId: string; subjectId: string; detail: SubjectDetail },
  { projectId: string; subjectId: string; token: string },
  { rejectValue: string }
>("projects/fetchSubject", async ({ projectId, subjectId, token }, { rejectWithValue }) => {
  try {
    return { projectId, subjectId, detail: await getSubject(projectId, subjectId, token) };
  } catch (error) {
    return rejectWithValue(failed(error, "Couldn't load this subject."));
  }
});

export const uploadProjectFileThunk = createAsyncThunk<
  { projectId: string; file: ProjectFile },
  { projectId: string; subjectId: string; picked: PickedFile; me: GroupPerson; token: string },
  { rejectValue: string }
>("projects/uploadFile", async ({ projectId, subjectId, picked, me, token }, { rejectWithValue }) => {
  try {
    return { projectId, file: await uploadProjectFile(projectId, subjectId, picked, me, token) };
  } catch (error) {
    return rejectWithValue(failed(error, `Couldn't upload ${picked.name}.`));
  }
});

// "+ Start Spark" on a subject: link a Spark, then reload the subject and project.
export const linkSparkThunk = createAsyncThunk<
  void,
  { projectId: string; subjectId: string; sparkId: string; token: string },
  { rejectValue: string }
>("projects/linkSpark", async ({ projectId, subjectId, sparkId, token }, { dispatch, rejectWithValue }) => {
  try {
    await linkProjectSpark(projectId, subjectId, sparkId, token);
    await Promise.all([dispatch(fetchSubject({ projectId, subjectId, token })), dispatch(fetchProject({ projectId, token }))]);
  } catch (error) {
    return rejectWithValue(failed(error, "Couldn't link the Spark."));
  }
});

// Live: someone changed a project (socket "project:updated" { projectId }).
// Reload it, and any of its subjects that are open.
export const refreshProject = createAsyncThunk<void, string>("projects/refresh", async (projectId, { dispatch, getState }) => {
  const state = getState() as any;
  const token = state.auth?.token as string | null;
  if (!token || !projectId) return;
  await dispatch(fetchProject({ projectId, token }));
  const keys = Object.keys(state.projects?.subjects || {}).filter((key) => key.startsWith(`${projectId}:`));
  await Promise.all(keys.map((key) => dispatch(fetchSubject({ projectId, subjectId: key.split(":")[1], token }))));
});
