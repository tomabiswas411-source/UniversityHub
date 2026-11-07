"use client";

import { create } from "zustand";
import type { SessionUser } from "@/types";

interface AuthState {
 user: SessionUser | null;
 loading: boolean;
 initialized: boolean;
 setUser: (user: SessionUser | null) => void;
 refresh: () => Promise<void>;
 logout: () => Promise<void>;
}

/* In-flight dedupe for refresh(): concurrent callers (dashboard mount,
   notification bell, 401 recovery…) share ONE /api/auth/me request and
   all resolve with the same single response — no duplicate fetches and
   no resolution-order races. */
let refreshInFlight: Promise<void> | null = null;

/** Hard ceiling for the /api/auth/me round-trip. Without it a hung
    request (stalled connection, captive portal) leaves refreshInFlight
    set forever: every later refresh() call re-awaits the same dead
    promise and the boot "Retry" button can never re-issue a fresh
    request. */
const REFRESH_TIMEOUT_MS = 15_000;

export const useAuthStore = create<AuthState>((set) => ({
 user: null,
 loading: false,
 initialized: false,
 setUser: (user) => set({ user, initialized: true }),
 refresh: () => {
 if (!refreshInFlight) {
 const controller = new AbortController();
 const timeoutId = setTimeout(
 () => controller.abort(),
 REFRESH_TIMEOUT_MS
 );
 refreshInFlight = (async () => {
 set({ loading: true });
 try {
 const res = await fetch("/api/auth/me", {
 signal: controller.signal,
 });
 if (res.status === 401 || res.status === 403) {
 // Server explicitly says "no session" — clear the user.
 set({ user: null, initialized: true, loading: false });
 return;
 }
 if (!res.ok) {
 // Transient server error — keep the previous session state
 // instead of flashing the visitor view.
 set({ initialized: true, loading: false });
 return;
 }
 const json = await res.json();
 set({
 user: json.success && json.data?.user ? (json.data.user as SessionUser) : null,
 initialized: true,
 loading: false,
 });
 } catch {
 // Network failure (offline, timeout abort) — keep the previous
 // state so a logged-in user doesn't get logged-out by a hiccup.
 set({ initialized: true, loading: false });
 } finally {
 clearTimeout(timeoutId);
 // Settled (success, failure or abort) → release the dedupe slot
 // so the next refresh()/Retry issues a FRESH request.
 refreshInFlight = null;
 }
 })();
 }
 return refreshInFlight;
 },
 logout: async () => {
 try {
 await fetch("/api/auth/logout", { method: "POST" });
 } catch {
 // Network failure must never trap the user in a dead session —
 // local state is cleared below no matter what; the cookie is
 // dropped server-side on the next authenticated request.
 } finally {
 set({ user: null });
 }
 },
}));
