import { apiRequest } from "./api";

export type Faction = {
  id: string;
  name: string;
  description?: string;
  image?: string;
};

export async function getFactions() {
  return apiRequest<Faction[]>("/api/factions");
}
