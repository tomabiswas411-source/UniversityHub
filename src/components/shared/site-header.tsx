"use client";

import { motion } from "framer-motion";
import { GraduationCap, Moon, Sun, Menu, LayoutDashboard, UserRound } from "lucide-react";
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
import { canSeePricing, type RoleUser } from "@/lib/role-access";
import { initials } from "@/lib/format";
import { NotificationBell } from "@/components/shared/notification-bell";
import { StaffProfileDialog } from "@/components/shared/staff-profile-dialog";
import { GRADIENT_BTN } from "@/components/dashboards/dashboard-shared";
import { cn } from "@/lib/utils";
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

/* Desktop nav now lives in the AppSidebar (app-style rail). The header
   keeps a compact "Dashboard" shortcut on md–lg screens only, where the
   sidebar is hidden but there is room for one link. */

export function SiteHeader({ view, navigate }: SiteHeaderProps) {
 const { user, logout } = useAuthStore();
 const { theme, setTheme } = useTheme();
 const mounted = useMounted();
 const [scrolled, setScrolled] = useState(false);
 /* Self-service profile (staff roles) — opened from the Account menu.
    Students deliberately don't get it: their academic records are
    office-controlled and their profile tab already exists. */
 const [profileOpen, setProfileOpen] = useState(false);

 /* The sidebar rail (lg+) carries the brand ONLY on the dashboard.
    Everywhere else the header is the sole navigation — so its brand
    and pill nav stay visible on large screens there. */
 const railVisible = view === "dashboard";

 useEffect(() => {
 const onScroll = () => setScrolled(window.scrollY > 8);
 window.addEventListener("scroll", onScroll);
 return () => window.removeEventListener("scroll", onScroll);
 }, []);

 /* Avatar monogram — shared initials() so it matches faculty cards
    ("Dr. A. Rahman" → "AR", honorifics skipped). */
 const userInitials = user?.fullName ? initials(user.fullName) : "";

 return (
 <motion.header
 initial={{ y: -60, opacity: 0 }}
 animate={{ y: 0, opacity: 1 }}
 transition={{ duration: 0.4, ease: "easeOut" }}
 className={`sticky top-0 z-50 w-full border-b pt-[env(safe-area-inset-top)] transition-all duration-300 ${
 scrolled
 ? "bg-background/80 backdrop-blur-xl border-border shadow-sm"
 : "bg-transparent border-transparent"
 }`}
 >
 {/* Day 46 — keyboard users can skip the header straight to content */}
 <a
 href="#main-content"
 className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-[#241C15] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#FFE01B] focus:shadow-lg"
 >
 Skip to main content
 </a>
 <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 h-16 flex items-center justify-between gap-2">
 {/* Brand — hidden on lg+ where the sidebar rail carries the brand */}
 <button
 onClick={() => navigate("home")}
 className={cn(
 "flex items-center gap-2.5 group shrink-0",
 railVisible && "lg:invisible lg:pointer-events-none"
 )}
 aria-label="Go to home"
 >
 <div className="relative">
 <div className="absolute inset-0 rounded-2xl bg-gold/50 blur-md group-hover:bg-gold/70 transition-colors" />
 <div className="relative w-10 h-10 rounded-xl bg-[#241C15] flex items-center justify-center shadow-md shadow-[#241C15]/25 group-hover:scale-105 transition-transform">
 <GraduationCap className="w-5.5 h-5.5 text-[#FFE01B]" strokeWidth={2.2} />
 </div>
 </div>
 <div className="text-left hidden min-[380px]:block">
 <div className="font-display font-bold text-lg leading-tight text-ink dark:text-[#EFEDE9]">
 UniversityHub<span className="text-[#B8940A] dark:text-gold">.</span>
 </div>
 <div className="text-[10px] text-muted-foreground leading-tight">
 Academic Management Platform
 </div>
 </div>
 </button>

 {/* Compact nav — md screens always; lg+ only when the sidebar
    rail is NOT showing (public views own the header there). */}
 <nav
 className={cn(
 "hidden md:flex items-center gap-1 bg-secondary/60 rounded-full px-2 py-1.5 border border-border",
 railVisible && "lg:hidden"
 )}
 >
 <button
 onClick={() => navigate("home")}
 aria-current={view === "home" ? "page" : undefined}
 className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
 view === "home"
 ? "bg-[#2D4F35] text-white shadow-md shadow-[#2D4F35]/30"
 : "text-foreground/70 hover:text-green hover:bg-green/10"
 }`}
 >
 Home
 </button>
 {canSeePricing(user) && (
 <button
 onClick={() => navigate("pricing")}
 aria-current={view === "pricing" ? "page" : undefined}
 className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
 view === "pricing"
 ? "bg-[#2D4F35] text-white shadow-md shadow-[#2D4F35]/30"
 : "text-foreground/70 hover:text-green hover:bg-green/10"
 }`}
 >
 Pricing
 </button>
 )}
 {user && (
 <button
 onClick={() => navigate("dashboard")}
 aria-current={view === "dashboard" ? "page" : undefined}
 className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
 view === "dashboard"
 ? "bg-[#2D4F35] text-white shadow-md shadow-[#2D4F35]/30"
 : "text-foreground/70 hover:text-green hover:bg-green/10"
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
 {/* Neutral same-size placeholder until mounted — a dark-theme user
     would otherwise see a Moon flash on first paint. */}
 {!mounted ? (
 <span className="h-5 w-5" aria-hidden />
 ) : theme === "dark" ? (
 <Sun className="w-5 h-5" />
 ) : (
 <Moon className="w-5 h-5" />
 )}
 </Button>

 {/* Live alerts — only for signed-in users (polls /api/notifications) */}
 {mounted && user && <NotificationBell />}

 {mounted && user ? (
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <button
 className="outline-none ring-[#2D4F35] focus-visible:ring-2 rounded-full"
 aria-label="Account menu"
 >
 <Avatar className="w-9 h-9 border-2 border-[#2D4F35]/50 shadow-md shadow-[#2D4F35]/20">
 <AvatarFallback className="bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-white text-xs font-bold">
 {userInitials || "U"}
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
 <LayoutDashboard className="w-4 h-4 mr-2" /> My Dashboard
 </DropdownMenuItem>
 {(user.role === "teacher" ||
 user.role === "dept_admin" ||
 user.role === "super_admin") && (
 <DropdownMenuItem onClick={() => setProfileOpen(true)}>
 <UserRound className="w-4 h-4 mr-2" /> My Profile
 </DropdownMenuItem>
 )}
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
 className={cn("rounded-full px-4 sm:px-5", GRADIENT_BTN)}
 >
 Login
 </Button>
 )}
 {profileOpen && (
 <StaffProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
 )}
 </div>
 </div>
 </motion.header>
 );
}
