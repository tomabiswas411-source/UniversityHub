import type { ApiResponse } from "@/types";
import { useAuthStore } from "@/store/auth-store";

/**
 * Typed fetch wrapper for our JSON APIs.
 *
 * Extra (non-fetch) option:
 *  - `skipAuthRedirect` — opt out of the global "401 → login" bounce for
 *    flows that handle auth inline themselves (e.g. the QR scan page and
 *    the inline student login, where a hard redirect would lose the QR
 *    token / show the wrong error).
 */
export interface ApiOptions extends RequestInit {
  skipAuthRedirect?: boolean;
}

/** Module-level latch so a burst of parallel 401s redirects only once. */
let authRedirectStarted = false;

function handle401(skipAuthRedirect?: boolean): void {
  if (typeof window === "undefined") return;
  // Session is gone — drop any stale user state in the store immediately.
  useAuthStore.getState().setUser(null);
  if (skipAuthRedirect || authRedirectStarted) return;
  // Already on the login portal? Don't loop.
  if (window.location.search.includes("view=login")) return;
  authRedirectStarted = true;
  window.location.href = "/?view=login";
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { skipAuthRedirect, ...init } = options;
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.success) {
    // Only a 401 means "session expired" — bounce to the login portal
    // once. 403/4xx/5xx stay as normal thrown errors for the caller.
    if (res.status === 401) handle401(skipAuthRedirect);
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json.data as T;
}

export const apiGet = <T>(path: string, options?: ApiOptions) =>
  api<T>(path, options);

export const apiPost = <T>(path: string, body: unknown, options?: ApiOptions) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body), ...options });

export const apiPut = <T>(path: string, body: unknown, options?: ApiOptions) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body), ...options });

export const apiPatch = <T>(path: string, body?: unknown, options?: ApiOptions) =>
  api<T>(path, {
    method: "PATCH",
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...options,
  });

export const apiDelete = <T>(path: string, options?: ApiOptions) =>
  api<T>(path, { method: "DELETE", ...options });
