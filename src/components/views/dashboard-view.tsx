"use client";

import { motion } from "framer-motion";
import { LogIn, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { GRADIENT_BTN } from "@/components/dashboards/dashboard-shared";
import { SuperAdminPanel } from "@/components/dashboards/super-admin-panel";
import { DeptAdminPanel } from "@/components/dashboards/dept-admin-panel";
import { TeacherPanel } from "@/components/dashboards/teacher-panel";
import { StudentPanel } from "@/components/dashboards/student-panel";
import { Button } from "@/components/ui/button";

type NavView = "home" | "department" | "login" | "pricing" | "dashboard";

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
 <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#241C15] shadow-xl shadow-[#241C15]/25 glow-aurora">
 <LogIn className="h-8 w-8 text-[#FFE01B]" />
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

 return (
 <div className="space-y-5 sm:space-y-6">
 {/* Role panels */}
 {user.role === "super_admin" && <SuperAdminPanel />}
 {user.role === "dept_admin" && <DeptAdminPanel />}
 {user.role === "teacher" && <TeacherPanel />}
 {user.role === "student" && <StudentPanel />}
 </div>
 );
}
