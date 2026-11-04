"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/shared/site-header";
import { SiteFooter } from "@/components/shared/site-footer";
import { MobileNav } from "@/components/shared/mobile-nav";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { ScrollProgress } from "@/components/shared/motion-primitives";
import { HomeView } from "@/components/views/home-view";
import { DepartmentView } from "@/components/views/department-view";
import { LoginView } from "@/components/views/login-view";
import { PricingView } from "@/components/views/pricing-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { AttendView } from "@/components/views/attend-view";
import { ScanView } from "@/components/views/scan-view";
import { Loader2, GraduationCap } from "lucide-react";

export type AppView = "home" | "department" | "login" | "pricing" | "dashboard" | "attend" | "scan";

/* Every ?view= value the app understands — anything else in the URL
   falls back to "home" instead of rendering a blank page. */
const KNOWN_VIEWS: readonly AppView[] = [
 "home",
 "department",
 "login",
 "pricing",
 "dashboard",
 "attend",
 "scan",
];

function parseView(raw: string | null): AppView {
 return raw != null && (KNOWN_VIEWS as readonly string[]).includes(raw)
 ? (raw as AppView)
 : "home";
}

function AppShell() {
 const searchParams = useSearchParams();
 const router = useRouter();
 const { refresh, initialized } = useAuthStore();

 const view = parseView(searchParams.get("view"));
 const deptId = searchParams.get("dept");
 const tabParam = searchParams.get("tab") ?? undefined;
 /* The sidebar rail is APP chrome — it only lives on the dashboard.
    Public views (home/department/pricing/login) use the header nav,
    so the marketing pages stay clean. */
 const showRail = view === "dashboard";

 const [booting, setBooting] = useState(true);

 useEffect(() => {
 refresh().finally(() => setBooting(false));
 }, [refresh]);

 const navigate = (
 v: AppView,
 params?: Record<string, string>,
 opts?: { scroll?: boolean }
 ) => {
 const sp = new URLSearchParams();
 if (v !== "home") sp.set("view", v);
 if (params) {
 Object.entries(params).forEach(([k, val]) => sp.set(k, val));
 }
 const qs = sp.toString();
 router.push(qs ? `/?${qs}` : "/");
 // In-page tab switches keep the scroll position — only real
 // view changes jump to the top.
 if (opts?.scroll !== false) {
 window.scrollTo({ top: 0, behavior: "smooth" });
 }
 };

 if (booting || !initialized) {
 return (
 <div className="min-h-screen flex flex-col bg-gradient-to-b from-gold/20 via-background to-background ">
 <div className="flex-1 flex flex-col items-center justify-center gap-4">
 <div className="relative">
 <div className="absolute inset-0 rounded-3xl bg-gold/40 blur-2xl animate-pulse" />
 <div className="relative w-16 h-16 rounded-2xl bg-[#241C15] flex items-center justify-center shadow-xl shadow-[#241C15]/25">
 <GraduationCap className="w-8 h-8 text-[#FFE01B]" />
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
 <div className="min-h-screen flex flex-col bg-gradient-to-b from-gold/20 via-background to-background lg:flex-row">
 {/* Desktop app rail — the menu lives on the side from lg up;
    mobile/tablet keeps the app-style bottom tab bar. */}
 <AppSidebar view={view} navigate={navigate} tab={tabParam} />

 <div
 className={cn(
 "flex min-h-screen flex-1 flex-col",
 showRail && "lg:pl-64"
 )}
 >
 <SiteHeader view={view} navigate={navigate} />
 <ScrollProgress />

 <main
 id="main-content"
 tabIndex={-1}
 className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 pb-24 md:pb-8"
 >
 <Suspense
 fallback={
 <div className="flex items-center justify-center py-24">
 <Loader2 className="w-8 h-8 animate-spin text-green" />
 </div>
 }
 >
 {/* Smooth cross-fade + rise between app views */}
 <AnimatePresence mode="wait" initial={false}>
 <motion.div
 key={`${view}-${deptId ?? ""}`}
 initial={{ opacity: 0, y: 14 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -10 }}
 transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
 >
 {view === "home" && <HomeView navigate={navigate} />}
 {view === "department" && (
 <DepartmentView departmentId={deptId} navigate={navigate} />
 )}
 {view === "login" && <LoginView navigate={navigate} />}
 {view === "pricing" && <PricingView navigate={navigate} />}
 {view === "dashboard" && (
 <DashboardView
 navigate={navigate}
 tab={tabParam}
 onTabChange={(t) =>
 navigate("dashboard", { tab: t }, { scroll: false })
 }
 />
 )}
 {view === "attend" && <AttendView token={searchParams.get("k")} />}
 {view === "scan" && <ScanView navigate={navigate} />}
 </motion.div>
 </AnimatePresence>
 </Suspense>
 </main>

 <SiteFooter navigate={navigate} />
 </div>
 <MobileNav view={view} navigate={navigate} />
 </div>
 );
}

export default function Page() {
 return (
 <Suspense
 fallback={
 <div className="min-h-screen flex items-center justify-center">
 <Loader2 className="w-8 h-8 animate-spin text-green" />
 </div>
 }
 >
 <AppShell />
 </Suspense>
 );
}
