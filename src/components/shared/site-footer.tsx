"use client";

import { GraduationCap, Heart, ShieldCheck } from "lucide-react";
import type { AppView } from "@/app/page";
import { useAuthStore } from "@/store/auth-store";
import { canSeePricing } from "@/lib/role-access";

interface SiteFooterProps {
 navigate?: (v: AppView, params?: Record<string, string>) => void;
}

export function SiteFooter(_props: SiteFooterProps) {
 const { user } = useAuthStore();
 return (
 <footer className="mt-auto hidden w-full border-t border-border bg-gradient-to-b from-secondary to-background dark:from-[#241C15] dark:to-[#1A1612] md:block md:pb-8">
 <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
 {/* Brand */}
 <div>
 <div className="flex items-center gap-2.5 mb-3">
 <div className="w-9 h-9 rounded-xl bg-[#241C15] flex items-center justify-center shadow-md shadow-[#241C15]/25">
 <GraduationCap className="w-5 h-5 text-[#FFE01B]" />
 </div>
 <span className="font-display font-bold text-lg text-ink dark:text-[#EFEDE9]">
 UniversityHub<span className="text-[#B8940A] dark:text-gold">.</span>
 </span>
 </div>
 <p className="text-sm text-muted-foreground max-w-xs">
 One platform for every department — routines, notices,
 assignments, results and real-time notifications.
 </p>
 </div>

 {/* Quick links */}
 <div>
 <h4 className="font-semibold text-sm mb-3 text-heading">
 Quick Links
 </h4>
 <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
 {/* Plain anchors (no onClick-SPA) — full navigation is acceptable
     for footer links; `?view=` drives the app's query-param router. */}
 <a
 href="/?view=home"
 className="text-left hover:text-green transition-colors w-fit"
 >
 Home
 </a>
 {canSeePricing(user) && (
 <a
 href="/?view=pricing"
 className="text-left hover:text-green transition-colors w-fit"
 >
 Pricing &amp; Plans
 </a>
 )}
 {user ? (
 <a
 href="/?view=dashboard"
 className="text-left hover:text-green transition-colors w-fit"
 >
 My Dashboard
 </a>
 ) : (
 <a
 href="/?view=login"
 className="text-left hover:text-green transition-colors w-fit"
 >
 Login Portal
 </a>
 )}
 </nav>
 </div>

 {/* Trust */}
 <div>
 <h4 className="font-semibold text-sm mb-3 text-heading">
 Why UniversityHub?
 </h4>
 <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
 <li className="flex items-center gap-2">
 <ShieldCheck className="w-4 h-4 text-green" />
 Secure multi-university platform
 </li>
 <li className="flex items-center gap-2">
 <GraduationCap className="w-4 h-4 text-green" />
 Built for 4 academic roles
 </li>
 <li className="flex items-center gap-2">
 <Heart className="w-4 h-4 text-green" />
 Installable PWA with live alerts
 </li>
 </ul>
 </div>
 </div>

 <div className="mt-8 pt-5 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
 <span>
 © <span suppressHydrationWarning>{new Date().getFullYear()}</span> UniversityHub — Academic Management
 Platform
 </span>
 <span className="flex items-center gap-1">
 Developed with <Heart className="w-3 h-3 text-red-500 fill-red-500" />{" "}
 by <span className="font-semibold text-green">Topu Biswas (AI)</span>
 </span>
 </div>
 </div>
 </footer>
 );
}
