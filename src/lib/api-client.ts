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

/** Every request gets a default 15s ceiling so a hung server never
 *  freezes a spinner forever (callers can still pass their own signal). */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Only methods that can carry a body get the JSON Content-Type. */
const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
  const { skipAuthRedirect, headers, signal, ...init } = options;

  /* Timeout + caller signal are combined through ONE controller: our
     timer aborts on the 15s ceiling and the caller's own signal (if any)
     aborts through it too — both paths cancel the same request. */
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DEFAULT_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", abortFromCaller);
  }

  let res: Response;
  try {
    /* Caller headers MERGE with our defaults (caller values win per key)
       instead of replacing them wholesale — and the JSON Content-Type is
       only added for methods that actually carry a body. */
    const merged = new Headers(
      BODY_METHODS.has((init.method ?? "GET").toUpperCase())
        ? { "Content-Type": "application/json" }
        : undefined
    );
    for (const [key, value] of new Headers(headers ?? undefined)) merged.set(key, value);

    res = await fetch(path, {
      credentials: "same-origin", // explicit — session cookie must ride along
      ...init,
      headers: merged,
      signal: controller.signal,
    });
  } catch (err) {
    // A timeout surfaces as a bare AbortError — translate it into the
    // same human-readable error style every caller already renders.
    if (timedOut) {
      throw new Error("Request timed out. Please check your connection and try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", abortFromCaller);
  }
  let json: ApiResponse<T> | null = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      json = (await res.json()) as ApiResponse<T>;
    } catch {
      json = null;
    }
  }
  if (!json) {
    // Non-JSON body (e.g. a Vercel/CDN 502 HTML error page) — res.json()
    // would throw a cryptic SyntaxError, so surface a human-friendly one.
    // 401 still triggers the session-expiry bounce.
    if (res.status === 401) handle401(skipAuthRedirect);
    throw new Error("Server is unreachable. Please try again.");
  }
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
