import { apiRequest } from "./api";

// ==========================================
// POLLS
// ==========================================
// A poll is a chat message with kind "poll"; its results come in `poll`.

export type PollOption = { id: string; text: string; votes: number };

export type PollSummary = {
  question: string;
  options: PollOption[];
  multiple: boolean;
  anonymous: boolean;
  closesAt: string | null;
  closedAt: string | null;
  closed: boolean;
  totalVoters: number;
  // My own picks (missing in live updates: keep the ones you already have).
  myVotes?: string[];
};

export type PollVoter = {
  id: string;
  username: string;
  name?: string | null;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
};

export type PollClosesIn = "1h" | "1d" | "1w" | null;

function base(conversationId: string, messageId?: string) {
  const chat = `/api/chats/${encodeURIComponent(conversationId)}`;
  return messageId ? `${chat}/messages/${encodeURIComponent(messageId)}` : chat;
}

export async function createPoll(
  conversationId: string,
  data: {
    question: string;
    options: string[];
    multiple: boolean;
    anonymous: boolean;
    closesIn: PollClosesIn;
  },
  token: string,
) {
  const response = await apiRequest<any>(`${base(conversationId)}/polls`, {
    method: "POST",
    body: { ...data, closesIn: data.closesIn || undefined },
    token,
  });

  const message = response?.message ?? response;
  return { ...message, id: String(message?.id ?? message?._id ?? ""), conversationId };
}

export async function votePoll(
  conversationId: string,
  messageId: string,
  optionIds: string[],
  token: string,
): Promise<PollSummary> {
  const response = await apiRequest<any>(`${base(conversationId, messageId)}/vote`, {
    method: "POST",
    body: { optionIds },
    token,
  });
  return response?.poll;
}

export async function closePoll(conversationId: string, messageId: string, token: string): Promise<PollSummary> {
  const response = await apiRequest<any>(`${base(conversationId, messageId)}/poll/close`, {
    method: "POST",
    token,
  });
  return response?.poll;
}

export async function getPollVotes(
  conversationId: string,
  messageId: string,
  token: string,
): Promise<{ options: (PollOption & { voters: PollVoter[] })[]; totalVoters: number }> {
  const response = await apiRequest<any>(`${base(conversationId, messageId)}/poll/votes`, { token });
  return {
    options: (response?.options || []).map((option: any) => ({
      ...option,
      voters: (option?.voters || []).map((voter: any) => ({ ...voter, id: String(voter?.id ?? "") })),
    })),
    totalVoters: response?.totalVoters || 0,
  };
}

// Open/closed right now (also covers an end time passing while on screen).
export function pollIsClosed(poll?: Pick<PollSummary, "closed" | "closesAt"> | null) {
  if (!poll) return true;
  if (poll.closed) return true;
  return !!poll.closesAt && new Date(poll.closesAt).getTime() <= Date.now();
}
