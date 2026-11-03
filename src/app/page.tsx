"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { SiteHeader } from "@/components/shared/site-header";
import { SiteFooter } from "@/components/shared/site-footer";
import { MobileNav } from "@/components/shared/mobile-nav";
import { HomeView } from "@/components/views/home-view";
import { DepartmentView } from "@/components/views/department-view";
import { LoginView } from "@/components/views/login-view";
import { PricingView } from "@/components/views/pricing-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { Loader2, GraduationCap } from "lucide-react";

export type AppView = "home" | "department" | "login" | "pricing" | "dashboard";

function AppShell() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refresh, initialized } = useAuthStore();

  const view = (searchParams.get("view") as AppView) || "home";
  const deptId = searchParams.get("dept");

  const [booting, setBooting] = useState(true);

  useEffect(() => {
    refresh().finally(() => setBooting(false));
  }, [refresh]);

  const navigate = (v: AppView, params?: Record<string, string>) => {
    const sp = new URLSearchParams();
    if (v !== "home") sp.set("view", v);
    if (params) {
      Object.entries(params).forEach(([k, val]) => sp.set(k, val));
    }
    const qs = sp.toString();
    router.push(qs ? `/?${qs}` : "/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (booting || !initialized) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-violet-50/60 via-background to-background dark:from-violet-950/20">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-violet-500/20 blur-2xl animate-pulse" />
            <div className="relative w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-xl shadow-violet-500/30">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading UniversityHub...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-violet-50/60 via-background to-background dark:from-violet-950/20">
      <SiteHeader view={view} navigate={navigate} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 pb-24 md:pb-8">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
            </div>
          }
        >
          {view === "home" && <HomeView navigate={navigate} />}
          {view === "department" && (
            <DepartmentView departmentId={deptId} navigate={navigate} />
          )}
          {view === "login" && <LoginView navigate={navigate} />}
          {view === "pricing" && <PricingView navigate={navigate} />}
          {view === "dashboard" && <DashboardView navigate={navigate} />}
        </Suspense>
      </main>

      <SiteFooter />
      <MobileNav view={view} navigate={navigate} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
        </div>
      }
    >
      <AppShell />
    </Suspense>
  );
}
