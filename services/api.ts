import { canRetrySilently, fetchJson, isNetworkFailure, OFFLINE_MESSAGE, REQUEST_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from "./networkError";
import { signupTokenFor } from "./signupSession";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

if (!BASE_URL) {
  throw new Error("EXPO_PUBLIC_API_URL is not configured");
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string;
};

export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body } = options;
  // Onboarding calls carry the sign-up token (services/signupSession.ts).
  const token = options.token ?? signupTokenFor(endpoint);

  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  const headers: Record<string, string> = {};

  /*
   * Do not manually set Content-Type for FormData.
   * React Native/fetch needs to add the multipart boundary.
   */
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // No answer in 15 s (uploads 60 s) counts as no answer (audit B7).
  const send = () =>
    fetchJson(
      `${BASE_URL}${endpoint}`,
      {
        method,
        headers,
        body:
          body === undefined
            ? undefined
            : isFormData
              ? (body as FormData)
              : JSON.stringify(body),
      },
      isFormData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
    );

  // No answer at all: retry a read once, then say so in plain words (the
  // platform's text was shown as is, e.g. "java.net.ConnectException").
  let answer: Awaited<ReturnType<typeof send>>;
  try {
    answer = await send();
  } catch (error) {
    if (!isNetworkFailure(error)) throw error;
    if (!canRetrySilently(method)) throw new Error(OFFLINE_MESSAGE);
    try {
      answer = await send();
    } catch (again) {
      throw isNetworkFailure(again) ? new Error(OFFLINE_MESSAGE) : again;
    }
  }
  const { response, data } = answer;

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      data?.errors?.[0] ||
      "Something went wrong. Please try again.";

    // The HTTP status rides along, for screens that word each error differently.
    throw Object.assign(new Error(message), { status: response.status });
  }

  return data as T;
}
