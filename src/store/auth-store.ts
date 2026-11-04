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

export const useAuthStore = create<AuthState>((set) => ({
 user: null,
 loading: false,
 initialized: false,
 setUser: (user) => set({ user, initialized: true }),
 refresh: async () => {
 set({ loading: true });
 try {
 const res = await fetch("/api/auth/me");
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
 // Network failure (offline, timeout) — keep the previous state so a
 // logged-in user doesn't get logged-out by a hiccup.
 set({ initialized: true, loading: false });
 }
 },
 logout: async () => {
 await fetch("/api/auth/logout", { method: "POST" });
 set({ user: null });
 },
}));
