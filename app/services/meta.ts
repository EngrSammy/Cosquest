import { apiRequest } from "./api";

export type RemoteAvatar = {
  key: string;
  label?: string;
  imageUrl: string;
};

// GET /api/meta/avatars -> { avatars: [{ key, label, imageUrl }] }
export async function getAvatarCatalog(): Promise<RemoteAvatar[]> {
  const response = await apiRequest<{ avatars?: RemoteAvatar[] }>(
    "/api/meta/avatars",
  );

  return Array.isArray(response?.avatars) ? response.avatars : [];
}
