"use client";

/**
 * AppSidebar — desktop (lg+) app-style navigation rail.
 *
 * Mobile keeps the bottom tab bar (MobileNav); from `lg` up the menu
 * lives on the side like a real app shell — brand on top, role-aware
 * nav in the middle, account card pinned to the bottom.
 *
 * ROLE-VISIBILITY (least-privilege UI): every item goes through the
 * same canSeePricing / role checks the header and footer use, so
 * students never see Pricing and visitors never see Dashboard.
 */

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  GraduationCap,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  ScanLine,
  Tag,
} from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { canSeePricing } from "@/lib/role-access";
import { ROLE_LABELS } from "@/lib/role-labels";
import { cn } from "@/lib/utils";
import type { AppView } from "@/app/page";

interface AppSidebarProps {
  view: AppView;
  navigate: (v: AppView, params?: Record<string, string>) => void;
}

export function AppSidebar({ view, navigate }: AppSidebarProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const isStudent = user?.role === "student";

  const items: {
    view: AppView;
    label: string;
    icon: typeof Home;
    hint?: string;
  }[] = [
    { view: "home", label: "Home", icon: Home, hint: "Universities & departments" },
    ...(isStudent
      ? [{ view: "scan" as AppView, label: "Scan QR", icon: ScanLine, hint: "Attendance check-in" }]
      : []),
    ...(canSeePricing(user)
      ? [{ view: "pricing" as AppView, label: "Pricing", icon: Tag, hint: "Plans for institutions" }]
      : []),
    user
      ? { view: "dashboard" as AppView, label: "Dashboard", icon: LayoutDashboard, hint: "Your workspace" }
      : { view: "login" as AppView, label: "Login", icon: LogIn, hint: "Staff & students" },
  ];

  const initials =
    user?.fullName
      ?.split(" ")
      .filter((p) => !p.includes("."))
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "U";

  return (
    <motion.aside
      initial={{ x: -24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/5 bg-gradient-to-b from-[#241C15] via-[#1E1812] to-[#191410] lg:flex"
      aria-label="Main navigation"
    >
      {/* soft glow accents — same premium language as the panel heroes */}
      <div aria-hidden className="pointer-events-none absolute -left-10 top-24 h-44 w-44 rounded-full bg-gold/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-14 bottom-32 h-52 w-52 rounded-full bg-[#2D4F35]/30 blur-3xl" />

      {/* brand */}
      <button
        type="button"
        onClick={() => navigate("home")}
        className="group relative flex items-center gap-3 px-5 pb-5 pt-6 text-left"
        aria-label="UniversityHub home"
      >
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-gold/40 blur-md transition-colors group-hover:bg-gold/60" />
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0F0C08] shadow-lg">
            <GraduationCap className="h-6 w-6 text-[#FFE01B]" strokeWidth={2.2} />
          </div>
        </div>
        <div className="min-w-0">
          <p className="font-display text-lg font-bold leading-tight text-[#EFEDE9]">
            UniversityHub<span className="text-gold">.</span>
          </p>
          <p className="text-[10px] leading-tight text-white/45">
            Academic Management Platform
          </p>
        </div>
      </button>

      <div className="mx-5 h-px bg-white/10" aria-hidden />

      {/* nav */}
      <nav className="relative flex-1 space-y-1 overflow-y-auto px-3 py-4 [scrollbar-width:thin]">
        <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
          Menu
        </p>
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => navigate(item.view)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
                active
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/60 hover:bg-white/5 hover:text-white/90"
              )}
            >
              {/* active indicator */}
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gold transition-all",
                  active ? "opacity-100" : "opacity-0"
                )}
              />
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  active
                    ? "bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-white shadow-md shadow-[#2D4F35]/30"
                    : "bg-white/5 text-white/60 group-hover:bg-white/10 group-hover:text-white/80"
                )}
              >
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{item.label}</span>
                {item.hint && (
                  <span className="block truncate text-[10px] text-white/40">{item.hint}</span>
                )}
              </span>
            </button>
          );
        })}
      </nav>

      {/* account */}
      <div className="relative border-t border-white/10 p-3">
        {user ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-white/5 p-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-xs font-bold text-white shadow-md">
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-white/90">
                {user.fullName}
              </span>
              <span className="block truncate text-[10px] text-white/45">
                {ROLE_LABELS[user.role]}
                {user.departmentName ? ` · ${user.departmentName}` : ""}
              </span>
            </span>
            <button
              type="button"
              aria-label="Log out"
              title="Log out"
              onClick={async () => {
                await logout();
                navigate("home");
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => navigate("login")}
            className="btn-shine flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-[#2D4F35]/30 transition-transform hover:scale-[1.02]"
          >
            <LogIn className="h-4 w-4" />
            Login Portal
          </button>
        )}
        <p className="pt-2 text-center text-[9px] text-white/25">
          Installable app · works offline
        </p>
      </div>
    </motion.aside>
  );
}
