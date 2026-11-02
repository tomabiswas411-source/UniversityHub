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
      const json = await res.json();
      set({
        user: json.success && json.data?.user ? (json.data.user as SessionUser) : null,
        initialized: true,
        loading: false,
      });
    } catch {
      set({ user: null, initialized: true, loading: false });
    }
  },
  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    set({ user: null });
  },
}));
