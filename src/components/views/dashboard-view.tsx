"use client";

import { motion } from "framer-motion";
import { LogIn, ShieldCheck, GraduationCap, Users, Building2 } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { GRADIENT_BTN } from "@/components/dashboards/dashboard-shared";
import { SuperAdminPanel } from "@/components/dashboards/super-admin-panel";
import { DeptAdminPanel } from "@/components/dashboards/dept-admin-panel";
import { TeacherPanel } from "@/components/dashboards/teacher-panel";
import { StudentPanel } from "@/components/dashboards/student-panel";
import { Button } from "@/components/ui/button";

type NavView = "home" | "department" | "login" | "pricing" | "dashboard";

const ROLE_META: Record<
  string,
  { icon: typeof ShieldCheck; title: string; sub: string }
> = {
  super_admin: {
    icon: Building2,
    title: "System Control Center",
    sub: "Manage universities, departments and subscription plans",
  },
  dept_admin: {
    icon: Users,
    title: "Department Control Panel",
    sub: "Teachers, students, routines and notices for your department",
  },
  teacher: {
    icon: GraduationCap,
    title: "Teacher Cockpit",
    sub: "Your schedule, class changes, assignments and results",
  },
  student: {
    icon: GraduationCap,
    title: "Student Home",
    sub: "Your classes, notices, assignments and results in one place",
  },
};

export function DashboardView({
  navigate,
}: {
  navigate: (v: NavView, params?: Record<string, string>) => void;
}) {
  const { user } = useAuthStore();

  if (!user) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-md py-16 text-center"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-amber-600 shadow-xl shadow-indigo-500/30 glow-aurora">
          <LogIn className="h-8 w-8 text-white" />
        </div>
        <h1 className="mb-1 text-xl font-bold">Login required</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Sign in to access your personalized dashboard — routines, notices,
          assignments and real-time alerts.
        </p>
        <Button
          onClick={() => navigate("login")}
          size="lg"
          className={`${GRADIENT_BTN} h-11 px-8`}
        >
          <ShieldCheck className="mr-2 h-4 w-4" /> Go to Login
        </Button>
      </motion.div>
    );
  }

  const meta = ROLE_META[user.role];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Role banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border bg-card p-5 shadow-sm sm:p-6"
      >
        <div className="aurora-blob -right-16 -top-20 h-56 w-56 bg-indigo-400/40 dark:bg-indigo-600/20" />
        <div className="aurora-blob -left-10 -bottom-10 h-40 w-40 bg-amber-400/30 dark:bg-amber-600/15" />
        <div className="relative flex flex-wrap items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-amber-600 text-white shadow-lg shadow-indigo-500/30">
            {meta && meta.icon ? <meta.icon className="h-6 w-6" /> : <GraduationCap className="h-6 w-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold sm:text-xl">
              {meta?.title ?? "Dashboard"}
            </h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              {meta?.sub}
            </p>
          </div>
          <span className="aurora-text text-sm font-bold uppercase tracking-wider">
            {String(user.role ?? "").replace("_", " ")}
          </span>
        </div>
      </motion.div>

      {/* Role panels */}
      {user.role === "super_admin" && <SuperAdminPanel />}
      {user.role === "dept_admin" && <DeptAdminPanel />}
      {user.role === "teacher" && <TeacherPanel />}
      {user.role === "student" && <StudentPanel />}
    </div>
  );
}
