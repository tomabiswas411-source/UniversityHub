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
  Users,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api-client";
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
function initialsOf(name: string, fallback = "U"): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return fallback;
  const letters = words
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return letters.toUpperCase() || fallback;
}

function uniMonogram(u: UniversityDTO): string {
  const short = u.shortName?.trim();
  return short ? short.slice(0, 4).toUpperCase() : initialsOf(u.name);
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
    <div className="mx-auto mb-6 max-w-2xl text-center sm:mb-8">
      <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-600 dark:text-indigo-400">
        {eyebrow}
      </span>
      <h2 className="mt-1.5 text-2xl font-extrabold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {subtitle}
        </p>
      ) : null}
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
        className="mt-5 h-11 rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-600 hover:to-amber-700"
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
    <div className="rounded-2xl border border-dashed border-indigo-200/70 px-6 py-12 text-center dark:border-indigo-900/60">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-amber-600/15 dark:from-indigo-500/20 dark:to-amber-600/20">
        <Icon className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
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
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl" />
        </div>
      </div>
      {/* Features skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
    { key: "universities", label: "Universities", icon: Building2, value: stats.universities, grad: "from-indigo-500 to-amber-600" },
    { key: "departments", label: "Departments", icon: Network, value: stats.departments, grad: "from-amber-500 to-indigo-600" },
    { key: "teachers", label: "Teachers", icon: Users, value: stats.teachers, grad: "from-indigo-600 to-amber-500" },
    { key: "students", label: "Students", icon: GraduationCap, value: stats.students, grad: "from-amber-600 to-indigo-500" },
    { key: "schedules", label: "Class Schedules", icon: CalendarDays, value: stats.schedules, grad: "from-indigo-500 via-indigo-600 to-amber-600" },
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
            className="absolute -top-10 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-500/10"
          />
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ repeat: Infinity, duration: 9, ease: "easeInOut" }}
            className="absolute right-[8%] top-24 h-44 w-44 rounded-full bg-amber-400/15 blur-3xl dark:bg-amber-500/10"
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
              className="rounded-full border-indigo-200/70 bg-indigo-50/60 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 dark:border-indigo-800/70 dark:bg-indigo-950/40 dark:text-indigo-300"
            >
              <GraduationCap className="h-3.5 w-3.5" />
              Academic Management Platform
            </Badge>
          </motion.div>

          <motion.h1
            variants={riseIn}
            className="mt-5 bg-gradient-to-r from-indigo-600 via-amber-600 to-indigo-600 bg-clip-text text-4xl font-extrabold leading-tight tracking-tight text-transparent sm:text-6xl"
          >
            UniversityHub
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
              className="h-11 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 px-7 text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-600 hover:to-amber-700 sm:w-auto"
            >
              Explore Departments
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => navigate("login")}
              variant="outline"
              className="h-11 w-full rounded-xl border-indigo-200/80 px-7 hover:bg-indigo-50 hover:text-indigo-700 dark:border-indigo-800/70 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300 sm:w-auto"
            >
              Login Portal
            </Button>
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
                <b.icon className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                {b.label}
              </span>
            ))}
          </motion.div>
        </motion.div>
      </section>

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
              <Card className="h-full gap-0 rounded-2xl border-indigo-100/80 py-0 shadow-sm transition-shadow hover:shadow-lg hover:shadow-indigo-500/10 dark:border-indigo-900/50">
                <CardContent className="flex h-full items-center gap-3.5 p-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${s.grad} text-white shadow-lg shadow-indigo-500/25`}
                  >
                    <s.icon className="h-6 w-6" strokeWidth={2.1} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-extrabold leading-tight">
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
            className="grid gap-4 md:grid-cols-2"
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
                  onClick={() => selectUniversity(u.slug, !selected)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectUniversity(u.slug, !selected);
                    }
                  }}
                  className={`group cursor-pointer rounded-2xl border bg-card p-5 text-left shadow-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    selected
                      ? "border-indigo-400 shadow-lg shadow-indigo-500/20 ring-2 ring-indigo-500 dark:border-indigo-600"
                      : "border-indigo-100/80 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/10 dark:border-indigo-900/50 dark:hover:border-indigo-700"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="relative shrink-0">
                      <div className="absolute inset-0 rounded-2xl bg-indigo-500/25 blur-md transition-colors group-hover:bg-indigo-500/40" />
                      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-amber-600 text-base font-extrabold text-white shadow-lg shadow-indigo-500/30">
                        {uniMonogram(u)}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold leading-snug">{u.name}</h3>
                        {u.planName ? (
                          <Badge
                            variant="secondary"
                            className="shrink-0 rounded-full bg-indigo-100/80 text-[11px] font-semibold text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
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
                          ? "bg-gradient-to-r from-indigo-600 to-amber-700 shadow-md shadow-indigo-600/25"
                          : "bg-gradient-to-r from-indigo-500 to-amber-600 shadow-md shadow-indigo-500/25 hover:from-indigo-600 hover:to-amber-700"
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
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                    className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                  >
                    {deptData.departments.map((dept) => (
                      <motion.div
                        key={dept.id}
                        variants={riseIn}
                        whileHover={{ y: -4 }}
                      >
                        <Card className="h-full gap-0 rounded-2xl border-indigo-100/80 py-0 shadow-sm transition-shadow hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/10 dark:border-indigo-900/50 dark:hover:border-indigo-800">
                          <CardContent className="flex h-full flex-col p-5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-amber-600 text-sm font-extrabold text-white shadow-md shadow-indigo-500/25">
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
                                <Users className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                                {dept._count?.teachers ?? 0} teachers
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2.5 py-1 text-[11px] font-medium">
                                <GraduationCap className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                                {dept._count?.students ?? 0} students
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2.5 py-1 text-[11px] font-medium">
                                <CalendarDays className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                                {dept._count?.schedules ?? 0} classes/week
                              </span>
                            </div>
                            <Button
                              onClick={() =>
                                navigate("department", { dept: dept.id })
                              }
                              className="mt-4 h-11 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-amber-600 font-semibold text-white shadow-md shadow-indigo-500/25 hover:from-indigo-600 hover:to-amber-700"
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
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              variants={riseIn}
              whileHover={{ y: -4, scale: 1.01 }}
            >
              <Card className="group h-full gap-0 rounded-2xl border-indigo-100/80 py-0 shadow-sm transition-shadow hover:shadow-lg hover:shadow-indigo-500/10 dark:border-indigo-900/50">
                <CardContent className="p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-amber-600 text-white shadow-lg shadow-indigo-500/25 transition-transform group-hover:scale-110">
                    <f.icon className="h-6 w-6" strokeWidth={2.1} />
                  </div>
                  <h3 className="mt-4 font-bold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {f.desc}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </div>
  );
}
