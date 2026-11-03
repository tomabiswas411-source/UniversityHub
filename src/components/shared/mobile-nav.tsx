"use client";

import { GraduationCap, Home, LayoutDashboard, LogIn, Tag } from "lucide-react";
import type { AppView } from "@/app/page";
import { useAuthStore } from "@/store/auth-store";
import { canSeePricing } from "@/lib/role-access";

interface MobileNavProps {
 view: AppView;
 navigate: (v: AppView, params?: Record<string, string>) => void;
}

export function MobileNav({ view, navigate }: MobileNavProps) {
 const { user } = useAuthStore();

 /* Role-aware bottom bar — each role sees only what it needs:
    • visitor  → Home · Pricing · Login
    • student/teacher → Home · Dashboard (no Pricing)
    • super_admin/dept_admin → Home · Pricing · Dashboard */
 const items: {
  view: AppView;
  label: string;
  icon: React.ReactNode;
 }[] = [
  { view: "home", label: "Home", icon: <Home className="w-5 h-5" /> },
  ...(canSeePricing(user)
   ? [{ view: "pricing" as AppView, label: "Pricing", icon: <Tag className="w-5 h-5" /> }]
   : []),
  user
   ? {
      view: "dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard className="w-5 h-5" />,
     }
   : { view: "login", label: "Login", icon: <LogIn className="w-5 h-5" /> },
 ];

 return (
  <nav
   className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/85 backdrop-blur-xl"
   style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
   aria-label="Mobile navigation"
  >
   <div
    className="grid"
    style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
   >
    {items.map((item) => {
     const active = view === item.view;
     return (
      <button
       key={item.label}
       onClick={() => navigate(item.view)}
       className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
        active ? "text-green" : "text-muted-foreground"
       }`}
      >
       <span
        className={`relative p-1.5 rounded-xl transition-all ${
         active
         ? "bg-green/10 "
         : "hover:bg-secondary"
        }`}
       >
        {item.icon}
        {active && (
         <span className="absolute -bottom-[9px] left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-gold-deep" />
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
  <div className="min-[380px]:hidden w-10 h-10 rounded-xl bg-[#241C15] flex items-center justify-center shadow-md shadow-[#241C15]/25">
   <GraduationCap className="w-5 h-5 text-[#FFE01B]" />
  </div>
 );
}
