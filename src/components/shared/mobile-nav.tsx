"use client";

/**
 * MobileNav — the app-style bottom tab bar (below `lg`, where the
 * AppSidebar rail takes over).
 *
 * App-like details:
 *  • fixed to the bottom, respects the iOS safe-area inset
 *  • students get an elevated centre "Scan" button (like a camera FAB)
 *    that opens the in-app QR scanner for attendance check-in
 *  • role-aware items — students/teachers never see Pricing
 */

import {
  Home,
  LayoutDashboard,
  LogIn,
  ScanLine,
  Tag,
} from "lucide-react";
import type { AppView } from "@/app/page";
import { useAuthStore } from "@/store/auth-store";
import { canSeePricing } from "@/lib/role-access";
import { cn } from "@/lib/utils";

interface MobileNavProps {
 view: AppView;
 navigate: (v: AppView, params?: Record<string, string>) => void;
}

export function MobileNav({ view, navigate }: MobileNavProps) {
 const { user } = useAuthStore();
 const isStudent = user?.role === "student";

 /* Role-aware bottom bar — each role sees only what it needs:
    • visitor  → Home · Pricing · Login
    • student  → Home · SCAN · Dashboard
    • teacher  → Home · Dashboard
    • super_admin/dept_admin → Home · Pricing · Dashboard */
 const sideItems: {
  view: AppView;
  label: string;
  icon: React.ReactNode;
 }[] = [
  { view: "home", label: "Home", icon: <Home className="w-5 h-5" /> },
  ...(canSeePricing(user)
   ? [{ view: "pricing" as AppView, label: "Pricing", icon: <Tag className="w-5 h-5" /> }]
   : []),
  !isStudent
   ? user
     ? { view: "dashboard" as AppView, label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" /> }
     : { view: "login" as AppView, label: "Login", icon: <LogIn className="w-5 h-5" /> }
   : { view: "dashboard" as AppView, label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
 ];

 /* Students: Home | (left) · SCAN (elevated centre) · Dashboard (right) */
 if (isStudent) {
  const left = sideItems.filter((i) => i.view === "home" || i.view === "pricing");
  const right = sideItems.filter((i) => i.view === "dashboard" || i.view === "login");
  return (
   <nav
    className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/90 backdrop-blur-xl"
    style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    aria-label="Mobile navigation"
   >
    <div className="grid grid-cols-3 items-end">
     {left.map((item) => (
      <TabButton key={item.label} {...item} active={view === item.view} onClick={() => navigate(item.view)} />
     ))}

     {/* elevated centre scan button */}
     <button
      type="button"
      onClick={() => navigate("scan")}
      aria-label="Scan attendance QR"
      aria-current={view === "scan" ? "page" : undefined}
      className="group relative flex flex-col items-center justify-start pt-1"
     >
      <span
       className={cn(
        "-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-white shadow-lg shadow-[#2D4F35]/40 ring-4 ring-background transition-transform group-active:scale-95",
        view === "scan" && "scale-105 ring-gold/60"
       )}
      >
       <ScanLine className="h-6 w-6" />
      </span>
      <span
       className={cn(
        "pb-2 text-[11px] font-semibold",
        view === "scan" ? "text-green" : "text-muted-foreground"
       )}
      >
       Scan
      </span>
     </button>

     {right.map((item) => (
      <TabButton key={item.label} {...item} active={view === item.view} onClick={() => navigate(item.view)} />
     ))}
    </div>
   </nav>
  );
 }

 return (
  <nav
   className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/90 backdrop-blur-xl"
   style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
   aria-label="Mobile navigation"
  >
   <div
    className="grid"
    style={{ gridTemplateColumns: `repeat(${sideItems.length}, minmax(0, 1fr))` }}
   >
    {sideItems.map((item) => (
     <TabButton key={item.label} {...item} active={view === item.view} onClick={() => navigate(item.view)} />
    ))}
   </div>
  </nav>
 );
}

function TabButton({
 view,
 label,
 icon,
 active,
 onClick,
}: {
 view: AppView;
 label: string;
 icon: React.ReactNode;
 active: boolean;
 onClick: () => void;
}) {
 return (
  <button
   key={view}
   type="button"
   onClick={onClick}
   aria-current={active ? "page" : undefined}
   className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
    active ? "text-green" : "text-muted-foreground"
   }`}
  >
   <span
    className={`relative p-1.5 rounded-xl transition-all ${
     active ? "bg-green/10" : "hover:bg-secondary"
    }`}
   >
    {icon}
    {active && (
     <span className="absolute -bottom-[9px] left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-gold-deep" />
    )}
   </span>
   {label}
  </button>
 );
}
