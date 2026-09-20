import { apiRequest } from "./api";

export async function getPosts(token: string) {
  return apiRequest("/api/posts", {
    token,
  });
}

export async function createPost(token: string, data: unknown) {
  return apiRequest("/api/posts", {
    method: "POST",
    body: data,
    token,
  });
}

export async function getPost(postId: string, token: string) {
  return apiRequest(`/api/posts/${postId}`, {
    token,
  });
}

export async function updatePost(postId: string, token: string, data: unknown) {
  return apiRequest(`/api/posts/${postId}`, {
    method: "PATCH",
    body: data,
    token,
  });
}

export async function deletePost(postId: string, token: string) {
  return apiRequest(`/api/posts/${postId}`, {
    method: "DELETE",
    token,
  });
}

export async function likePost(postId: string, token: string) {
  return apiRequest(`/api/posts/${postId}/like`, {
    method: "POST",
    token,
  });
}

export async function unlikePost(postId: string, token: string) {
  return apiRequest(`/api/posts/${postId}/like`, {
    method: "DELETE",
    token,
  });
}

export async function sharePost(postId: string, token: string) {
  return apiRequest(`/api/posts/${postId}/share`, {
    method: "POST",
    token,
  });
}

export async function bookmarkPost(postId: string, token: string) {
  return apiRequest(`/api/posts/${postId}/bookmark`, {
    method: "POST",
    token,
  });
}

export async function removeBookmark(postId: string, token: string) {
  return apiRequest(`/api/posts/${postId}/bookmark`, {
    method: "DELETE",
    token,
  });
}

export async function getComments(postId: string, token: string) {
  return apiRequest(`/api/posts/${postId}/comments`, {
    token,
  });
}

export async function addComment(postId: string, token: string, data: unknown) {
  return apiRequest(`/api/posts/${postId}/comments`, {
    method: "POST",
    body: data,
    token,
  });
}

export async function deleteComment(
  postId: string,
  commentId: string,
  token: string,
) {
  return apiRequest(`/api/posts/${postId}/comments/${commentId}`, {
    method: "DELETE",
    token,
  });
}
