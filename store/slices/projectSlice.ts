// ==========================================
// PROJECTS - state (group Projects tab)
// ==========================================
//   byId:          every project the app has seen
//   idsByChat:     the projects of each group chat (the Projects tab)
//   subjects:      a subject's files and Sparks, by "projectId:subjectId"
import { createSelector, createSlice } from "@reduxjs/toolkit";

import type { Project, SubjectDetail } from "@/services/projects";

import {
  addSubjectThunk,
  archiveProjectThunk,
  createProjectThunk,
  fetchProject,
  fetchProjects,
  fetchSubject,
  uploadProjectFileThunk,
} from "../thunks/projectThunks";

type State = {
  byId: Record<string, Project>;
  idsByChat: Record<string, string[]>;
  loadedChats: Record<string, boolean>;
  errorByChat: Record<string, string | null>;
  subjects: Record<string, SubjectDetail>;
};

const initialState: State = { byId: {}, idsByChat: {}, loadedChats: {}, errorByChat: {}, subjects: {} };

export const subjectKey = (projectId: string, subjectId: string) => `${projectId}:${subjectId}`;

function keep(state: State, project: Project) {
  state.byId[project.id] = project;
  const ids = state.idsByChat[project.conversationId];
  if (ids && !ids.includes(project.id)) ids.unshift(project.id);
  // Keep each open subject's header (name, counts) in step with the project.
  project.subjects.forEach((subject) => {
    const detail = state.subjects[subjectKey(project.id, subject.id)];
    if (detail) detail.subject = subject;
  });
}

const projectSlice = createSlice({
  name: "projects",
  initialState,
  reducers: {
    clearProjects() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.fulfilled, (state, action) => {
        const { conversationId, projects } = action.payload;
        projects.forEach((project) => {
          state.byId[project.id] = project;
        });
        state.idsByChat[conversationId] = projects.map((project) => project.id);
        state.loadedChats[conversationId] = true;
        state.errorByChat[conversationId] = null;
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.errorByChat[action.meta.arg.conversationId] = action.payload || "Couldn't load projects.";
      })
      .addCase(fetchProject.fulfilled, (state, action) => keep(state, action.payload))
      .addCase(createProjectThunk.fulfilled, (state, action) => keep(state, action.payload))
      .addCase(archiveProjectThunk.fulfilled, (state, action) => keep(state, action.payload))
      .addCase(addSubjectThunk.fulfilled, (state, action) => keep(state, action.payload))
      .addCase(fetchSubject.fulfilled, (state, action) => {
        const { projectId, subjectId, detail } = action.payload;
        state.subjects[subjectKey(projectId, subjectId)] = detail;
      })
      .addCase(uploadProjectFileThunk.fulfilled, (state, action) => {
        const { projectId, file } = action.payload;
        const detail = state.subjects[subjectKey(projectId, file.subjectId)];
        if (detail) detail.files.unshift(file);
      });
  },
});

export const { clearProjects } = projectSlice.actions;
export default projectSlice.reducer;

type WithProjects = { projects: State };

export const makeSelectChatProjects = () =>
  createSelector(
    [(state: WithProjects) => state.projects.byId, (state: WithProjects, conversationId: string) => state.projects.idsByChat[conversationId]],
    (byId, ids) => (ids || []).map((id) => byId[id]).filter(Boolean),
  );

export const selectProject = (state: WithProjects, projectId: string | undefined) =>
  projectId ? state.projects.byId[projectId] || null : null;

export const selectSubjectDetail = (state: WithProjects, projectId: string | undefined, subjectId: string | undefined) =>
  projectId && subjectId ? state.projects.subjects[subjectKey(projectId, subjectId)] || null : null;
