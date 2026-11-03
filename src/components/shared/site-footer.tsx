"use client";

import { GraduationCap, Heart, ShieldCheck } from "lucide-react";
import type { AppView } from "@/app/page";

interface SiteFooterProps {
  navigate?: (v: AppView, params?: Record<string, string>) => void;
}

export function SiteFooter({ navigate }: SiteFooterProps) {
  return (
    <footer className="mt-auto w-full border-t border-violet-200/50 dark:border-violet-900/50 bg-gradient-to-b from-violet-50/80 to-violet-100/60 dark:from-violet-950/30 dark:to-violet-900/20">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-md shadow-violet-500/25">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <span className="font-display font-bold text-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                UniversityHub
              </span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              One platform for every department — routines, notices,
              assignments, results and real-time notifications.
            </p>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="font-semibold text-sm mb-3 text-violet-800 dark:text-violet-300">
              Quick Links
            </h4>
            <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
              <button
                className="text-left hover:text-violet-700 transition-colors w-fit"
                onClick={() => navigate?.("home")}
              >
                Home
              </button>
              <button
                className="text-left hover:text-violet-700 transition-colors w-fit"
                onClick={() => navigate?.("pricing")}
              >
                Pricing & Plans
              </button>
              <button
                className="text-left hover:text-violet-700 transition-colors w-fit"
                onClick={() => navigate?.("login")}
              >
                Login Portal
              </button>
            </nav>
          </div>

          {/* Trust */}
          <div>
            <h4 className="font-semibold text-sm mb-3 text-violet-800 dark:text-violet-300">
              Why UniversityHub?
            </h4>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-violet-600" />
                Secure multi-university platform
              </li>
              <li className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-violet-600" />
                Built for 4 academic roles
              </li>
              <li className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-violet-600" />
                Installable PWA with live alerts
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-5 border-t border-violet-200/60 dark:border-violet-900/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            © {new Date().getFullYear()} UniversityHub — Academic Management
            Platform
          </span>
          <span className="flex items-center gap-1">
            Developed with <Heart className="w-3 h-3 text-red-500 fill-red-500" />{" "}
            by <span className="font-semibold text-violet-700">Topu Biswas (AI)</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
