import type { ApiResponse } from "@/types";

/** Typed fetch wrapper for our JSON APIs */
export async function api<T>(
 path: string,
 options: RequestInit = {}
): Promise<T> {
 const res = await fetch(path, {
 headers: { "Content-Type": "application/json" },
 ...options,
 });
 const json = (await res.json()) as ApiResponse<T>;
 if (!res.ok || !json.success) {
 throw new Error(json.error || `Request failed (${res.status})`);
 }
 return json.data as T;
}

export const apiGet = <T>(path: string) => api<T>(path);

export const apiPost = <T>(path: string, body: unknown) =>
 api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const apiPut = <T>(path: string, body: unknown) =>
 api<T>(path, { method: "PUT", body: JSON.stringify(body) });

export const apiPatch = <T>(path: string, body?: unknown) =>
 api<T>(path, { method: "PATCH", ...(body ? { body: JSON.stringify(body) } : {}) });

export const apiDelete = <T>(path: string) =>
 api<T>(path, { method: "DELETE" });
