import { apiRequest } from "./api";

export type Interest = {
  id: string;
  name: string;
};

export async function getInterests(token: string) {
  return apiRequest<Interest[]>("/api/meta/interests", {
    token,
  });
}
