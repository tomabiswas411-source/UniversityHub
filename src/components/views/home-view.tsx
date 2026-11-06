"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion, type Variants } from "framer-motion";
import {
 AlertTriangle,
 ArrowRight,
 BellRing,
 Building2,
 CalendarDays,
 ClipboardList,
 GraduationCap,
 MapPin,
 Network,
 RefreshCcw,
 Smartphone,
 Tag,
 Users,
 type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal, TiltCard } from "@/components/shared/motion-primitives";
import { apiGet } from "@/lib/api-client";
import { initials } from "@/lib/format";
import { GRADIENT_BTN } from "@/components/dashboards/dashboard-shared";
import { useAuthStore } from "@/store/auth-store";
import { canSeePricing } from "@/lib/role-access";
import type { DepartmentDTO, PlanDTO, UniversityDTO } from "@/types";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export type AppViewName =
 | "home"
 | "department"
 | "login"
 | "pricing"
 | "dashboard";
export type NavigateFn = (
 v: AppViewName,
 params?: Record<string, string>
) => void;

interface PortalResponse {
 universities: (UniversityDTO & { planName: string | null })[];
 plans: PlanDTO[];
 stats: {
 universities: number;
 departments: number;
 teachers: number;
 students: number;
 schedules: number;
 };
}

interface UniversityDepartmentsResponse {
 university: UniversityDTO;
 departments: DepartmentDTO[];
}

// ------------------------------------------------------------------
// Motion variants
// ------------------------------------------------------------------
const stagger: Variants = {
 hidden: {},
 show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const riseIn: Variants = {
 hidden: { opacity: 0, y: 24 },
 show: {
 opacity: 1,
 y: 0,
 transition: { duration: 0.45, ease: "easeOut" },
 },
};

// ------------------------------------------------------------------
// Small building blocks
// ------------------------------------------------------------------
function uniMonogram(u: UniversityDTO): string {
 const short = u.shortName?.trim();
 return short ? short.slice(0, 4).toUpperCase() : initials(u.name);
}

function AnimatedNumber({ value }: { value: number }) {
 const [display, setDisplay] = useState(0);

 useEffect(() => {
 const controls = animate(0, value, {
 duration: 1.2,
 ease: "easeOut",
 onUpdate: (v) => setDisplay(Math.round(v)),
 });
 return () => controls.stop();
 }, [value]);

 return <span className="tabular-nums">{display.toLocaleString()}</span>;
}

function SectionHeading({
 eyebrow,
 title,
 subtitle,
}: {
 eyebrow: string;
 title: string;
 subtitle?: string;
}) {
 return (
 <Reveal className="mx-auto mb-6 max-w-2xl text-center sm:mb-8">
 <span className="text-eyebrow">{eyebrow}</span>
 <h2 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
 {title}
 </h2>
 {subtitle ? (
 <p className="mt-2 text-sm text-muted-foreground sm:text-base">
 {subtitle}
 </p>
 ) : null}
 </Reveal>
 );
}

/* Infinite capability ticker — quiet editorial strip under the hero */
const TICKER_ITEMS = [
 "Class Routines",
 "Live Notices",
 "Assignments",
 "Results",
 "Push Alerts + Sound",
 "Installable PWA",
 "Multi-University",
 "4-Role Access",
 "Department Control",
 "Real-time Sync",
];

function TickerRow({ hidden }: { hidden?: boolean }) {
 return (
 <div aria-hidden={hidden} className="flex shrink-0 items-center">
 {TICKER_ITEMS.map((t) => (
 <span
 key={t}
 className="inline-flex items-center gap-3 whitespace-nowrap pr-3 text-sm font-semibold text-muted-foreground"
 >
 {t}
 <span className="text-[10px] text-gold-deep dark:text-gold">✦</span>
 </span>
 ))}
 </div>
 );
}

function CapabilityTicker() {
 return (
 <div className="marquee-mask overflow-hidden border-y border-border bg-card/60 py-3.5">
 <div className="animate-marquee flex w-max">
 <TickerRow />
 <TickerRow hidden />
 </div>
 </div>
 );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
 return (
 <motion.div
 initial={{ opacity: 0, y: 16 }}
 animate={{ opacity: 1, y: 0 }}
 className="rounded-2xl border border-red-200/70 bg-red-50/60 p-8 text-center dark:border-red-900/50 dark:bg-red-950/20"
 >
 <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-950/60">
 <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
 </div>
 <p className="mt-3 font-semibold text-red-900 dark:text-red-200">
 Something went wrong
 </p>
 <p className="mx-auto mt-1 max-w-sm text-sm text-red-700/80 dark:text-red-300/80">
 {message}
 </p>
 <Button
 onClick={onRetry}
 className="mt-5 h-11 rounded-xl bg-gradient-to-r from-[#2D4F35] to-[#4A7C58] text-white shadow-lg shadow-[#2D4F35]/25 hover:from-[#233D2A] hover:to-[#3A6B47]"
 >
 <RefreshCcw className="h-4 w-4" /> Try again
 </Button>
 </motion.div>
 );
}

function EmptyState({
 icon: Icon,
 title,
 hint,
}: {
 icon: LucideIcon;
 title: string;
 hint?: string;
}) {
 return (
 <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center ">
 <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2D4F35]/12 to-[#4A7C58]/12 dark:from-[#4A7C58]/22 dark:to-[#4A7C58]/22">
 <Icon className="h-7 w-7 text-green" />
 </div>
 <p className="mt-3 font-semibold">{title}</p>
 {hint ? (
 <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
 {hint}
 </p>
 ) : null}
 </div>
 );
}

// ------------------------------------------------------------------
// Skeletons
// ------------------------------------------------------------------
function HomeSkeleton() {
 return (
 <div className="space-y-10 sm:space-y-14">
 {/* Hero skeleton */}
 <div className="flex flex-col items-center gap-4 pt-10 text-center sm:pt-16">
 <Skeleton className="h-8 w-40 rounded-full" />
 <Skeleton className="h-12 w-80 max-w-full sm:h-16 sm:w-[28rem]" />
 <Skeleton className="h-5 w-72 max-w-full" />
 <div className="mt-2 flex gap-3">
 <Skeleton className="h-11 w-40 rounded-xl" />
 <Skeleton className="h-11 w-36 rounded-xl" />
 </div>
 </div>
 {/* Stats skeleton */}
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
 {Array.from({ length: 5 }).map((_, i) => (
 <Skeleton key={i} className="h-28 rounded-2xl" />
 ))}
 </div>
 {/* University grid skeleton */}
 <div>
 <Skeleton className="mx-auto mb-6 h-8 w-56" />
 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
 <Skeleton className="h-52 rounded-2xl" />
 <Skeleton className="h-52 rounded-2xl" />
 </div>
 </div>
 {/* Features skeleton */}
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {Array.from({ length: 6 }).map((_, i) => (
 <Skeleton key={i} className="h-40 rounded-2xl" />
 ))}
 </div>
 </div>
 );
}

// ------------------------------------------------------------------
// Data-driven constants
// ------------------------------------------------------------------
const HERO_BADGES: { icon: LucideIcon; label: string }[] = [
 { icon: Smartphone, label: "Installable PWA" },
 { icon: BellRing, label: "Real-time Notifications" },
 { icon: Users, label: "4 Roles" },
];

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
 {
 icon: CalendarDays,
 title: "Smart Scheduling",
 desc: "Weekly class routines with labs, rooms and breaks — always accurate and available on any device.",
 },
 {
 icon: Building2,
 title: "Department Control",
 desc: "Each department runs independently with its own courses, teachers, notices and class rooms.",
 },
 {
 icon: Users,
 title: "4 Role System",
 desc: "Tailored experiences for super admins, department heads, teachers and students.",
 },
 {
 icon: Smartphone,
 title: "Installable PWA",
 desc: "Install UniversityHub on your phone or desktop — it behaves just like a native app.",
 },
 {
 icon: BellRing,
 title: "Instant Alerts & Sound",
 desc: "Class cancellations and new notices arrive as real-time push notifications with sound.",
 },
 {
 icon: ClipboardList,
 title: "Assignments & Results",
 desc: "Publish assignments and release results — students see grades the moment they are out.",
 },
];

// ------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------
export function HomeView({ navigate }: { navigate: NavigateFn }) {
 const { user } = useAuthStore();
 const [data, setData] = useState<PortalResponse | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [retryTick, setRetryTick] = useState(0);
 const [doneTick, setDoneTick] = useState<number | null>(null);

 const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
 const [deptData, setDeptData] = useState<UniversityDepartmentsResponse | null>(null);
 const [deptError, setDeptError] = useState<string | null>(null);
 const [deptRetryTick, setDeptRetryTick] = useState(0);
 const [deptDoneKey, setDeptDoneKey] = useState<string | null>(null);

 // Loading is derived from "which fetch has completed" — this keeps the
 // effects free of synchronous setState calls (no cascading renders).
 const loading = doneTick !== retryTick;
 const deptKey = `${selectedSlug ?? ""}|${deptRetryTick}`;
 const deptLoading = selectedSlug != null && deptDoneKey !== deptKey;

 // ---- Platform data ----
 useEffect(() => {
 let cancelled = false;
 apiGet<PortalResponse>("/api/portal")
 .then((d) => {
 if (cancelled) return;
 setData(d);
 setError(null);
 setDoneTick(retryTick);
 // Auto-select the first university so its departments are visible.
 setSelectedSlug((prev) => prev ?? d.universities[0]?.slug ?? null);
 })
 .catch((e: unknown) => {
 if (cancelled) return;
 setError(e instanceof Error ? e.message : "Failed to load the platform");
 setDoneTick(retryTick);
 });
 return () => {
 cancelled = true;
 };
 }, [retryTick]);

 // ---- Departments of the selected university ----
 useEffect(() => {
 if (!selectedSlug) return;
 const key = `${selectedSlug}|${deptRetryTick}`;
 let cancelled = false;
 apiGet<UniversityDepartmentsResponse>(
 `/api/university-departments?slug=${encodeURIComponent(selectedSlug)}`
 )
 .then((d) => {
 if (cancelled) return;
 setDeptData(d);
 setDeptError(null);
 setDeptDoneKey(key);
 })
 .catch((e: unknown) => {
 if (cancelled) return;
 setDeptError(
 e instanceof Error ? e.message : "Failed to load departments"
 );
 setDeptDoneKey(key);
 });
 return () => {
 cancelled = true;
 };
 }, [selectedSlug, deptRetryTick]);

 const selectUniversity = (slug: string, scroll: boolean) => {
 setSelectedSlug(slug);
 if (scroll) {
 window.setTimeout(() => {
 document
 .getElementById("departments")
 ?.scrollIntoView({ behavior: "smooth", block: "start" });
 }, 80);
 }
 };

 if (loading) return <HomeSkeleton />;
 if (error || !data)
 return (
 <div className="py-10">
 <ErrorState
 message={error ?? "Platform data is unavailable right now."}
 onRetry={() => setRetryTick((t) => t + 1)}
 />
 </div>
 );

 const { universities, stats } = data;

 const statCards: { key: string; label: string; icon: LucideIcon; value: number; grad: string }[] = [
 { key: "universities", label: "Universities", icon: Building2, value: stats.universities, grad: "from-[#2D4F35] to-[#4A7C58]" },
 { key: "departments", label: "Departments", icon: Network, value: stats.departments, grad: "from-[#1B3358] to-[#3B5578]" },
 { key: "teachers", label: "Teachers", icon: Users, value: stats.teachers, grad: "from-[#2D4F35] to-[#4A7C58]" },
 { key: "students", label: "Students", icon: GraduationCap, value: stats.students, grad: "from-[#C8442E] to-[#E55A3F]" },
 { key: "schedules", label: "Class Schedules", icon: CalendarDays, value: stats.schedules, grad: "from-[#2D4F35] via-[#3A6B47] to-[#4A7C58]" },
 ];

 return (
 <div className="space-y-12 sm:space-y-16">
 {/* ============================== HERO ============================== */}
 <section className="relative overflow-hidden pt-8 sm:pt-14">
 {/* Decorative blobs */}
 <div className="pointer-events-none absolute inset-0 -z-10">
 <motion.div
 animate={{ y: [0, -14, 0] }}
 transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
 className="absolute -top-10 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-gold/25 blur-3xl dark:bg-gold/10"
 />
 <motion.div
 animate={{ y: [0, 12, 0] }}
 transition={{ repeat: Infinity, duration: 9, ease: "easeInOut" }}
 className="absolute right-[8%] top-24 h-44 w-44 rounded-full bg-[#4A7C58]/15 blur-3xl dark:bg-[#4A7C58]/10"
 />
 </div>

 <motion.div
 variants={stagger}
 initial="hidden"
 animate="show"
 className="mx-auto flex max-w-3xl flex-col items-center text-center"
 >
 <motion.div variants={riseIn}>
 <Badge
 variant="outline"
 className="rounded-full border-transparent bg-gold px-3.5 py-1.5 text-xs font-semibold text-[#241C15] shadow-sm"
 >
 <GraduationCap className="h-3.5 w-3.5" />
 Academic Management Platform
 </Badge>
 </motion.div>

 <motion.h1
 variants={riseIn}
 className="mt-5 text-4xl leading-[1.08] tracking-tight text-heading sm:text-6xl"
 >
 Every campus,
 <br />
 <span className="bg-gradient-to-r from-[#B8940A] to-[#E6C800] bg-clip-text text-transparent dark:from-gold dark:to-gold-soft">
 beautifully in sync.
 </span>
 </motion.h1>

 <motion.p
 variants={riseIn}
 className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg"
 >
 One platform for every department — classes, notices &amp; results
 in real time.
 </motion.p>

 <motion.div
 variants={riseIn}
 className="mt-7 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row"
 >
 <Button
 onClick={() =>
 document
 .getElementById("universities")
 ?.scrollIntoView({ behavior: "smooth", block: "start" })
 }
 className={`h-11 w-full rounded-xl px-7 sm:w-auto ${GRADIENT_BTN}`}
 >
 Explore Universities
 <ArrowRight className="h-4 w-4" />
 </Button>
 <Button
 onClick={() =>
 user
 ? navigate("dashboard")
 : navigate("login")
 }
 variant="outline"
 className="h-11 w-full rounded-xl border-border bg-card px-7 text-heading hover:border-[#2D4F35]/50 hover:bg-green/5 hover:text-green sm:w-auto"
 >
 {user ? "Go to Dashboard" : "Login Portal"}
 </Button>
 {/* Institutional plans — shown to any user who canSeePricing:
    visitors and subscription decision-makers (super_admin /
    dept_admin). Students/teachers never see pricing (role rule). */}
 {canSeePricing(user) && (
 <Button
 onClick={() => navigate("pricing")}
 variant="outline"
 className="h-11 w-full rounded-xl border-[#B8940A]/40 bg-gold/10 px-7 text-[#8A7000] hover:bg-gold/20 dark:border-gold/30 dark:text-gold sm:w-auto"
 >
 <Tag className="mr-2 h-4 w-4" />
 Plans &amp; Pricing
 </Button>
 )}
 </motion.div>

 <motion.div
 variants={riseIn}
 className="mt-7 flex flex-wrap items-center justify-center gap-2"
 >
 {HERO_BADGES.map((b) => (
 <span
 key={b.label}
 className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border bg-background/70 px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur"
 >
 <b.icon className="h-3.5 w-3.5 text-green" />
 {b.label}
 </span>
 ))}
 </motion.div>
 </motion.div>
 </section>

 {/* ======================= CAPABILITY TICKER ======================== */}
 <CapabilityTicker />

 {/* ========================== STATS STRIP =========================== */}
 <section>
 <motion.div
 variants={stagger}
 initial="hidden"
 whileInView="show"
 viewport={{ once: true, margin: "-60px" }}
 className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5"
 >
 {statCards.map((s, i) => (
 <motion.div
 key={s.key}
 variants={riseIn}
 whileHover={{ y: -4 }}
 className={
 i === statCards.length - 1
 ? "max-lg:col-span-2 max-sm:col-span-2"
 : ""
 }
 >
 <Card className="h-full gap-0 rounded-2xl border-border py-0 shadow-sm transition-shadow hover:shadow-lg hover:shadow-[#2D4F35]/10 ">
 <CardContent className="flex h-full items-center gap-3.5 p-4">
 <div
 className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${s.grad} text-white shadow-lg shadow-[#2D4F35]/25`}
 >
 <s.icon className="h-6 w-6" strokeWidth={2.1} />
 </div>
 <div className="min-w-0">
 <div className="font-display text-2xl font-extrabold leading-tight">
 <AnimatedNumber value={s.value} />
 </div>
 <div className="truncate text-xs font-medium text-muted-foreground">
 {s.label}
 </div>
 </div>
 </CardContent>
 </Card>
 </motion.div>
 ))}
 </motion.div>
 </section>

 {/* ========================== UNIVERSITIES ========================== */}
 <section id="universities" className="scroll-mt-20">
 <SectionHeading
 eyebrow="Campuses"
 title="Our Universities"
 subtitle="Pick a university to browse its departments, routines and notices."
 />

 {universities.length === 0 ? (
 <EmptyState
 icon={Building2}
 title="No universities yet"
 hint="Universities will appear here as soon as they join UniversityHub."
 />
 ) : (
 <motion.div
 variants={stagger}
 initial="hidden"
 whileInView="show"
 viewport={{ once: true, margin: "-60px" }}
 className="grid grid-cols-1 gap-4 md:grid-cols-2"
 >
 {universities.map((u) => {
 const selected = u.slug === selectedSlug;
 return (
 <motion.div
 key={u.id}
 variants={riseIn}
 whileHover={{ y: -4 }}
 role="button"
 tabIndex={0}
 aria-label={`${u.name} — browse departments`}
 onClick={() => selectUniversity(u.slug, !selected)}
 onKeyDown={(e) => {
 // Keyboard parity for the click-to-select card.
 if (e.key === "Enter" || e.key === " ") {
 e.preventDefault();
 selectUniversity(u.slug, !selected);
 }
 }}
 className={`group cursor-pointer rounded-2xl border bg-card p-5 text-left shadow-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#2D4F35] ${
 selected
 ? "border-[#2D4F35] shadow-lg shadow-[#2D4F35]/20 ring-2 ring-[#2D4F35] dark:border-[#4A7C58]"
 : "border-border hover:border-[#4A7C58]/70 hover:shadow-lg hover:shadow-[#2D4F35]/10 "
 }`}
 >
 <div className="flex items-start gap-4">
 <div className="relative shrink-0">
 <div className="absolute inset-0 rounded-2xl bg-gold/40 blur-md transition-colors group-hover:bg-gold/60" />
 <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-base font-extrabold text-white shadow-lg shadow-[#2D4F35]/30">
 {uniMonogram(u)}
 </div>
 </div>
 <div className="min-w-0 flex-1">
 <div className="flex items-start justify-between gap-2">
 <h3 className="font-bold leading-snug">{u.name}</h3>
 {u.planName ? (
 <Badge
 variant="secondary"
 className="shrink-0 rounded-full bg-green/10 text-[11px] font-semibold text-heading "
 >
 {u.planName}
 </Badge>
 ) : null}
 </div>
 {u.address ? (
 <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
 <MapPin className="h-3.5 w-3.5 shrink-0" />
 <span className="truncate">{u.address}</span>
 </p>
 ) : null}
 <p className="mt-2 text-xs font-medium text-muted-foreground">
 {u._count?.departments ?? 0} departments ·{" "}
 {u._count?.users ?? 0} members
 </p>
 </div>
 </div>
 <div className="mt-4 flex justify-end">
 <Button
 size="sm"
 onClick={(e) => {
 e.stopPropagation();
 selectUniversity(u.slug, !selected);
 }}
 className={`h-10 min-h-[44px] rounded-xl px-4 font-semibold text-white ${
 selected
 ? "bg-[#233D2A] shadow-md shadow-[#2D4F35]/25"
 : GRADIENT_BTN
 }`}
 >
 {selected ? "Viewing" : "Enter University"}
 <ArrowRight className="h-4 w-4" />
 </Button>
 </div>
 </motion.div>
 );
 })}
 </motion.div>
 )}

 {/* ------------------ Departments of selected university ------------------ */}
 <div id="departments" className="mt-8 scroll-mt-24 sm:mt-10">
 <AnimatePresence mode="wait">
 {selectedSlug ? (
 <motion.div
 key={selectedSlug}
 initial={{ opacity: 0, y: 16 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -8 }}
 transition={{ duration: 0.28, ease: "easeOut" }}
 >
 <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1">
 <h3 className="text-lg font-bold sm:text-xl">
 Departments
 {deptData?.university.shortName ? (
 <span className="text-muted-foreground">
 {" "}
 · {deptData.university.shortName}
 </span>
 ) : null}
 </h3>
 <span className="text-xs text-muted-foreground">
 Choose a department to view its routine, notices &amp;
 faculty
 </span>
 </div>

 {deptLoading ? (
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
 {Array.from({ length: 3 }).map((_, i) => (
 <Skeleton key={i} className="h-56 rounded-2xl" />
 ))}
 </div>
 ) : deptError ? (
 <ErrorState
 message={deptError}
 onRetry={() => setDeptRetryTick((t) => t + 1)}
 />
 ) : !deptData || deptData.departments.length === 0 ? (
 <EmptyState
 icon={Network}
 title="No departments yet"
 hint="This university hasn't added any departments so far."
 />
 ) : (
 <motion.div
 variants={stagger}
 initial="hidden"
 animate="show"
 className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
 >
 {deptData.departments.map((dept) => (
 <motion.div
 key={dept.id}
 variants={riseIn}
 whileHover={{ y: -4 }}
 >
 <Card className="h-full gap-0 rounded-2xl border-border py-0 shadow-sm transition-shadow hover:border-[#4A7C58]/50 hover:shadow-lg hover:shadow-[#2D4F35]/10 ">
 <CardContent className="flex h-full flex-col p-5">
 <div className="flex items-center gap-3">
 <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-sm font-extrabold text-white shadow-md shadow-[#2D4F35]/25">
 {dept.shortName.slice(0, 4).toUpperCase()}
 </div>
 <h4 className="min-w-0 flex-1 truncate font-bold">
 {dept.name}
 </h4>
 </div>
 <p className="mt-2.5 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
 {dept.description ||
 "Explore courses, routine and faculty of this department."}
 </p>
 <div className="mt-3 flex flex-wrap gap-1.5">
 <span className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2.5 py-1 text-[11px] font-medium">
 <Users className="h-3 w-3 text-green" />
 {dept._count?.teachers ?? 0} teachers
 </span>
 <span className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2.5 py-1 text-[11px] font-medium">
 <GraduationCap className="h-3 w-3 text-green" />
 {dept._count?.students ?? 0} students
 </span>
 <span className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2.5 py-1 text-[11px] font-medium">
 <CalendarDays className="h-3 w-3 text-green" />
 {dept._count?.schedules ?? 0} classes/week
 </span>
 </div>
 <Button
 onClick={() =>
 navigate("department", { dept: dept.id })
 }
 className={`mt-4 h-11 w-full rounded-xl font-semibold ${GRADIENT_BTN}`}
 >
 View Department
 <ArrowRight className="h-4 w-4" />
 </Button>
 </CardContent>
 </Card>
 </motion.div>
 ))}
 </motion.div>
 )}
 </motion.div>
 ) : null}
 </AnimatePresence>
 </div>
 </section>

 {/* ============================ FEATURES ============================ */}
 <section>
 <SectionHeading
 eyebrow="Features"
 title="Why UniversityHub?"
 subtitle="Everything a university needs to run its academic life — in one place."
 />
 <motion.div
 variants={stagger}
 initial="hidden"
 whileInView="show"
 viewport={{ once: true, margin: "-60px" }}
 className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
 >
 {FEATURES.map((f) => (
 <motion.div
 key={f.title}
 variants={riseIn}
 className="h-full"
 >
 <TiltCard className="h-full">
 <Card className="group h-full gap-0 rounded-2xl border-border py-0 shadow-sm transition-shadow hover:shadow-lg hover:shadow-[#2D4F35]/10 ">
 <CardContent className="p-5">
 <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#241C15] shadow-md shadow-[#241C15]/25 transition-transform group-hover:scale-110">
 <f.icon className="h-6 w-6 text-[#FFE01B]" strokeWidth={2.1} />
 </div>
 <h3 className="mt-4 font-bold">{f.title}</h3>
 <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
 {f.desc}
 </p>
 </CardContent>
 </Card>
 </TiltCard>
 </motion.div>
 ))}
 </motion.div>
 </section>
 </div>
 );
}
