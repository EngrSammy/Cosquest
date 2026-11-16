// After the event: attendance (no-shows) and results (winners).
// Backend: events-backend (EVENTS.md).
import { adminRequest } from "./admin";

export type EventPerson = { id: string; name: string; username: string | null; avatarKey?: string | null; avatarPhotoUrl?: string | null } | null;
export type AttendanceRow = { ticketId: string; person: EventPerson; checkedInAt: string | null };
export type Attendance = { virtual?: boolean; ended: boolean; tickets: number; checkedIn: number; attendees: AttendanceRow[]; noShows: AttendanceRow[]; notYetIn: AttendanceRow[] };
export type Winner = { ticketId: string; place: number; placeLabel: string; prizeNote: string; person: EventPerson };
export type Results = { winners: Winner[]; publishedAt: string | null; auditEvent?: string };

export const getAttendance = (questId: string) => adminRequest<Attendance>(`/quests/${questId}/attendance`);
export const getResults = (questId: string) => adminRequest<Results>(`/quests/${questId}/results`);
export const saveResults = (questId: string, winners: { ticketId: string; place: number; prizeNote?: string }[]) =>
  adminRequest<Results>(`/quests/${questId}/results`, { method: "PUT", body: { winners } });
export const publishResults = (questId: string) => adminRequest<Results>(`/quests/${questId}/results/publish`, { method: "POST" });
