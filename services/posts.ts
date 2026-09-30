import { appendFileToFormData } from "@/utils/appendFileToFormData";

import { apiRequest } from "./api";

/* =========================================================
   POSTS
========================================================= */

export async function getPosts(token: string) {
  return apiRequest("/api/posts?page=1&limit=20", {
    token,
  });
}

export async function createPost(
  token: string,
  data: {
    type: "thought";
    content: string;
  },
) {
  return apiRequest("/api/posts", {
    method: "POST",
    body: data,
    token,
  });
}

export async function createImagePost(
  token: string,
  content: string,
  files: {
    uri: string;
    name: string;
    type: string;
  }[],
) {
  const formData = new FormData();

  formData.append("type", "image");
  formData.append("content", content);

  for (const fileInfo of files) {
    await appendFileToFormData(formData, "media", fileInfo);
  }

  return apiRequest("/api/posts", {
    method: "POST",
    body: formData,
    token,
  });
}

export async function createReelPost(
  token: string,
  content: string,
  fileInfo: {
    uri: string;
    name: string;
    type: string;
  },
) {
  const formData = new FormData();

  formData.append("type", "reel");
  formData.append("content", content);

  await appendFileToFormData(formData, "media", fileInfo);

  return apiRequest("/api/posts", {
    method: "POST",
    body: formData,
    token,
  });
}

export async function getPost(postId: string, token: string) {
  return apiRequest(`/api/posts/${postId}`, {
    token,
  });
}

export async function updatePost(
  postId: string,
  token: string,
  data: {
    content: string;
  },
) {
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

/* =========================================================
   POST LIKE
========================================================= */

export async function likePost(postId: string, token: string) {
  return apiRequest(`/api/posts/${postId}/likes`, {
    method: "POST",
    token,
  });
}

export async function unlikePost(postId: string, token: string) {
  return apiRequest(`/api/posts/${postId}/likes`, {
    method: "DELETE",
    token,
  });
}

/* =========================================================
   SHARE
========================================================= */

export async function sharePost(postId: string, token: string) {
  return apiRequest(`/api/posts/${postId}/shares`, {
    method: "POST",
    token,
  });
}

/* =========================================================
   BOOKMARK
========================================================= */

export async function bookmarkPost(postId: string, token: string) {
  return apiRequest(`/api/posts/${postId}/bookmarks`, {
    method: "POST",
    token,
  });
}

export async function removeBookmark(postId: string, token: string) {
  return apiRequest(`/api/posts/${postId}/bookmarks`, {
    method: "DELETE",
    token,
  });
}

/* =========================================================
   COMMENTS
========================================================= */

export async function getComments(
  postId: string,
  token: string,
  parentComment?: string,
) {
  const params = new URLSearchParams();

  params.append("page", "1");
  params.append("limit", "20");

  if (parentComment) {
    params.append("parentComment", parentComment);
  }

  return apiRequest(`/api/posts/${postId}/comments?${params.toString()}`, {
    token,
  });
}

// `data.file` is optional — when present, this sends multipart form data
// (body/parentComment become form fields, the audio goes in as `media`,
// same convention createImagePost/createReelPost already use) instead of
// a plain JSON body. body is now optional too: a voice comment may carry
// no typed text at all, just the recording.
export async function addComment(
  postId: string,
  token: string,
  data: {
    body?: string;
    parentComment?: string;
    file?: {
      uri: string;
      name: string;
      type: string;
    };
  },
) {
  if (data.file) {
    const formData = new FormData();

    if (data.body) {
      formData.append("body", data.body);
    }

    if (data.parentComment) {
      formData.append("parentComment", data.parentComment);
    }

    await appendFileToFormData(formData, "media", data.file);

    return apiRequest(`/api/posts/${postId}/comments`, {
      method: "POST",
      body: formData,
      token,
    });
  }

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

/* =========================================================
   COMMENT LIKE
========================================================= */

export async function likeComment(
  postId: string,
  commentId: string,
  token: string,
) {
  return apiRequest(`/api/posts/${postId}/comments/${commentId}/likes`, {
    method: "POST",
    token,
  });
}

export async function unlikeComment(
  postId: string,
  commentId: string,
  token: string,
) {
  return apiRequest(`/api/posts/${postId}/comments/${commentId}/likes`, {
    method: "DELETE",
    token,
  });
}
