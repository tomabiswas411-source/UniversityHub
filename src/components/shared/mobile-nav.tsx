"use client";

import { GraduationCap, Home, LayoutDashboard, Tag } from "lucide-react";
import type { AppView } from "@/app/page";

interface MobileNavProps {
  view: AppView;
  navigate: (v: AppView, params?: Record<string, string>) => void;
}

export function MobileNav({ view, navigate }: MobileNavProps) {
  const items: {
    view: AppView;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { view: "home", label: "Home", icon: <Home className="w-5 h-5" /> },
    { view: "pricing", label: "Pricing", icon: <Tag className="w-5 h-5" /> },
    {
      view: "dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-violet-200/60 dark:border-violet-900/60 bg-background/85 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-3">
        {items.map((item) => {
          const active = view === item.view;
          return (
            <button
              key={item.view}
              onClick={() => navigate(item.view)}
              className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground"
              }`}
            >
              <span
                className={`relative p-1.5 rounded-xl transition-all ${
                  active
                    ? "bg-violet-100 dark:bg-violet-900/40"
                    : "hover:bg-secondary"
                }`}
              >
                {item.icon}
                {active && (
                  <span className="absolute -bottom-[9px] left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-violet-500" />
                )}
              </span>
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function MobileBrandMark() {
  return (
    <div className="min-[380px]:hidden w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
      <GraduationCap className="w-5 h-5 text-white" />
    </div>
  );
}
