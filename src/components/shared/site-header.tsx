"use client";

import { motion } from "framer-motion";
import { GraduationCap, Moon, Sun, Menu, Bell } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuthStore } from "@/store/auth-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS } from "@/lib/role-labels";
import type { AppView } from "@/app/page";

const emptySubscribe = () => () => {};
const useMounted = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

interface SiteHeaderProps {
  view: AppView;
  navigate: (v: AppView, params?: Record<string, string>) => void;
}

const NAV_ITEMS: { view: AppView; label: string }[] = [
  { view: "home", label: "Home" },
  { view: "pricing", label: "Pricing" },
];

export function SiteHeader({ view, navigate }: SiteHeaderProps) {
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const initials = user?.fullName
    ?.split(" ")
    .filter((p) => !p.includes("."))
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`sticky top-0 z-50 w-full border-b transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-violet-200/50 dark:border-violet-900/50 shadow-sm"
          : "bg-transparent border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 h-16 flex items-center justify-between gap-2">
        {/* Logo */}
        <button
          onClick={() => navigate("home")}
          className="flex items-center gap-2.5 group shrink-0"
          aria-label="Go to home"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-violet-500/25 blur-md group-hover:bg-violet-500/40 transition-colors" />
            <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/30 group-hover:scale-105 transition-transform">
              <GraduationCap className="w-5.5 h-5.5 text-white" strokeWidth={2.2} />
            </div>
          </div>
          <div className="text-left hidden min-[380px]:block">
            <div className="font-display font-bold text-lg leading-tight bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
              UniversityHub
            </div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              Academic Management Platform
            </div>
          </div>
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 bg-secondary/60 rounded-full px-2 py-1.5 border border-violet-200/40 dark:border-violet-900/40">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.view}
              onClick={() => navigate(item.view)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                view === item.view
                  ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-600/30"
                  : "text-foreground/70 hover:text-violet-700 hover:bg-violet-500/10 dark:hover:text-violet-300 dark:hover:bg-violet-400/10"
              }`}
            >
              {item.label}
            </button>
          ))}
          {user && (
            <button
              onClick={() => navigate("dashboard")}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                view === "dashboard"
                  ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-600/30"
                  : "text-foreground/70 hover:text-violet-700 hover:bg-violet-500/10 dark:hover:text-violet-300 dark:hover:bg-violet-400/10"
              }`}
            >
              Dashboard
            </button>
          )}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            className="rounded-full"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {mounted && theme === "dark" ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </Button>

          {mounted && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="outline-none ring-violet-500 focus-visible:ring-2 rounded-full"
                  aria-label="Account menu"
                >
                  <Avatar className="w-9 h-9 border-2 border-violet-500/60 shadow-md shadow-violet-500/20">
                    <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-xs font-bold">
                      {initials || "U"}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-semibold truncate">{user.fullName}</div>
                  <div className="text-xs text-muted-foreground font-normal">
                    {ROLE_LABELS[user.role]}
                    {user.departmentName ? ` · ${user.departmentName}` : ""}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("dashboard")}>
                  <Bell className="w-4 h-4 mr-2" /> My Dashboard
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await logout();
                    navigate("home");
                  }}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30"
                >
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              onClick={() => navigate("login")}
              className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-600 hover:to-fuchsia-700 text-white shadow-lg shadow-violet-500/25 px-4 sm:px-5"
            >
              Login
            </Button>
          )}
        </div>
      </div>
    </motion.header>
  );
}
