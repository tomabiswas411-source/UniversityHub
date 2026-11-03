"use client";

/**
 * AttendView — the page a student lands on after scanning the teacher's
 * classroom QR code (`/?view=attend&k=<token>`).
 *
 * COST GUARD: the whole flow is TWO tiny requests —
 *  1. GET /api/attendance/scan?token= (page info, <1 KB)
 *  2. POST /api/attendance/scan {token} (mark present, ~100 B response)
 * No polling, no fan-out, no image uploads. Everything else is local UI.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCheck,
  Clock,
  GraduationCap,
  KeyRound,
  Loader2,
  ScanLine,
  UserCheck,
  XCircle,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ScanInfo {
  state: "active" | "expired" | "closed";
  date: string;
  courseCode: string;
  courseName: string;
  startTime: string;
  endTime: string;
  teacherName: string;
  program: string | null;
  department: string | null;
  universitySlug: string | null;
  universityName: string | null;
  presentCount: number;
  expiresAt: string;
  myStatus: string | null;
  serverTime: string;
}

type Result = { kind: "success" | "already" | "corrected" } | null;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

export function AttendView({ token }: { token: string | null }) {
  const user = useAuthStore((s) => s.user);
  const refreshAuth = useAuthStore((s) => s.refresh);

  const [info, setInfo] = useState<ScanInfo | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /* inline student login (when the phone had no session) */
  const [idNumber, setIdNumber] = useState("");
  const [roll, setRoll] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginErr, setLoginErr] = useState<string | null>(null);

  const [marking, setMarking] = useState(false);
  const [markErr, setMarkErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const markedOnce = useRef(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoadErr("This link has no QR token. Scan the QR shown in your classroom.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiGet<ScanInfo>(`/api/attendance/scan?token=${encodeURIComponent(token)}`);
      setInfo(data);
      setLoadErr(null);
    } catch (err) {
      setLoadErr(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const markPresent = useCallback(async () => {
    if (!token || marking || markedOnce.current) return;
    setMarking(true);
    setMarkErr(null);
    try {
      const data = await apiPost<{ already: boolean; corrected?: boolean }>("/api/attendance/scan", { token });
      markedOnce.current = true;
      if (data.corrected) setResult("corrected");
      else if (data.already) setResult("already");
      else setResult("success");
      void load(); // refresh myStatus (one tiny GET)
    } catch (err) {
      setMarkErr(errMsg(err));
    } finally {
      setMarking(false);
    }
  }, [token, marking, load]);

  const loginAndMark = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!info?.universitySlug) {
        setLoginErr("University information missing from this QR code.");
        return;
      }
      if (!idNumber.trim() || !roll.trim()) {
        setLoginErr("Enter both your Student ID and Roll Number.");
        return;
      }
      setLoggingIn(true);
      setLoginErr(null);
      try {
        await apiPost("/api/auth/student-login", {
          universitySlug: info.universitySlug,
          studentIdNumber: idNumber.trim(),
          rollNumber: roll.trim(),
        });
        await refreshAuth();
        // intent of the scan = be marked present → auto-mark right after login
        setLoggingIn(false);
        void markPresent();
      } catch (err) {
        setLoginErr(errMsg(err));
        setLoggingIn(false);
      }
    },
    [info, idNumber, roll, refreshAuth, markPresent]
  );

  /* ---------------- render states ---------------- */

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-muted-foreground">
        <ScanLine className="h-8 w-8 animate-pulse text-green" />
        Reading QR code…
      </div>
    );
  }

  if (loadErr || !info) {
    return (
      <StatusCard
        tone="rose"
        icon={XCircle}
        title="QR code not recognised"
        message={loadErr ?? "This QR code is not valid."}
      />
    );
  }

  const isStudent = user?.role === "student";

  return (
    <div className="mx-auto max-w-lg space-y-5 py-2">
      {/* class header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl border bg-card shadow-sm"
      >
        <div className="bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] px-5 py-4 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-80">
            {info.department ?? "Department"}
            {info.program ? ` · ${info.program}` : ""}
          </p>
          <h1 className="font-display text-2xl leading-tight">{info.courseCode}</h1>
          <p className="text-sm opacity-90">{info.courseName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {info.startTime}–{info.endTime}
          </span>
          <span className="inline-flex items-center gap-1">
            <GraduationCap className="h-3.5 w-3.5" /> {info.teacherName}
          </span>
          <span className="ml-auto font-semibold text-[#2D4F35] dark:text-[#7FB08F]">
            {info.presentCount} scanned
          </span>
        </div>
      </motion.div>

      {/* success / already */}
      {result && (
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/30"
        >
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
            <CheckCheck className="h-8 w-8 text-white" />
          </div>
          <p className="text-lg font-bold text-emerald-800 dark:text-emerald-300">
            {result === "success" && "You are marked PRESENT ✅"}
            {result === "already" && "You were already marked present"}
            {result === "corrected" && "Your status was corrected to PRESENT"}
          </p>
          <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
            {info.courseCode} · {info.date}
          </p>
        </motion.div>
      )}

      {/* expired / closed states */}
      {!result && info.state !== "active" && (
        <StatusCard
          tone="amber"
          icon={AlertTriangle}
          title={info.state === "expired" ? "The check-in time is over" : "This check-in window is closed"}
          message={
            info.myStatus
              ? `Your recorded status for this class: ${info.myStatus.toUpperCase()}.`
              : "Ask your teacher to reopen a QR window or mark you manually."
          }
        />
      )}

      {/* active → mark flow */}
      {!result && info.state === "active" && (
        <>
          {isStudent ? (
            info.myStatus === "present" ? (
              <Presented />
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border bg-card p-6 text-center shadow-sm"
              >
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] shadow-lg shadow-[#2D4F35]/30">
                  <UserCheck className="h-8 w-8 text-[#FFE01B]" />
                </div>
                <p className="mb-1 text-lg font-bold">Hi {user?.name?.split(" ")[0] ?? "there"} 👋</p>
                <p className="mb-5 text-sm text-muted-foreground">
                  Confirm your presence for <span className="font-semibold">{info.courseCode}</span>
                </p>
                <Button
                  size="lg"
                  className={cn("h-12 w-full text-base", "btn-shine bg-[#2D4F35] hover:bg-[#3A6B47] text-white shadow-md shadow-[#2D4F35]/25")}
                  onClick={() => void markPresent()}
                  disabled={marking}
                >
                  {marking ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCheck className="mr-2 h-5 w-5" />}
                  {marking ? "Marking you present…" : "Mark me Present"}
                </Button>
                {markErr && (
                  <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                    {markErr}
                  </p>
                )}
              </motion.div>
            )
          ) : user ? (
            <StatusCard
              tone="amber"
              icon={AlertTriangle}
              title="You are logged in as staff"
              message="QR self check-in works from a student account. Log out and scan again with a student login."
            />
          ) : (
            /* inline mini student login — university is locked from the QR */
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border bg-card p-6 shadow-sm"
            >
              <div className="mb-4 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gold/25">
                  <KeyRound className="h-6 w-6 text-[#8A7000] dark:text-gold" />
                </div>
                <p className="text-base font-bold">Student login to check in</p>
                <p className="text-xs text-muted-foreground">
                  {info.universityName ?? "Your university"} · one tap and you&apos;re marked present
                </p>
              </div>
              <form onSubmit={loginAndMark} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="att-id">Student ID</Label>
                  <Input
                    id="att-id"
                    inputMode="numeric"
                    autoComplete="username"
                    placeholder="e.g. 2103055"
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="att-roll">Roll Number</Label>
                  <Input
                    id="att-roll"
                    inputMode="numeric"
                    autoComplete="current-password"
                    placeholder="e.g. 05"
                    value={roll}
                    onChange={(e) => setRoll(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="btn-shine h-11 w-full bg-[#2D4F35] hover:bg-[#3A6B47] text-white shadow-md shadow-[#2D4F35]/25"
                  disabled={loggingIn}
                >
                  {loggingIn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
                  {loggingIn ? "Checking in…" : "Login & Mark Present"}
                </Button>
                {(loginErr || markErr) && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-center text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                    {loginErr ?? markErr}
                  </p>
                )}
              </form>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- small presentational helpers ---------- */

function Presented() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/30"
    >
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
        <CheckCheck className="h-8 w-8 text-white" />
      </div>
      <p className="text-lg font-bold text-emerald-800 dark:text-emerald-300">You are marked PRESENT ✅</p>
    </motion.div>
  );
}

function StatusCard({
  tone,
  icon: Icon,
  title,
  message,
}: {
  tone: "rose" | "amber";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
}) {
  const tones = {
    rose: {
      box: "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30",
      icon: "text-rose-600 dark:text-rose-400",
      title: "text-rose-800 dark:text-rose-300",
      msg: "text-rose-700/80 dark:text-rose-400/80",
    },
    amber: {
      box: "border-amber-300/60 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
      icon: "text-amber-600 dark:text-amber-400",
      title: "text-amber-800 dark:text-amber-300",
      msg: "text-amber-700/90 dark:text-amber-400/80",
    },
  }[tone];
  return (
    <div className={cn("rounded-2xl border p-6 text-center", tones.box)}>
      <Icon className={cn("mx-auto mb-3 h-10 w-10", tones.icon)} />
      <p className={cn("text-base font-bold", tones.title)}>{title}</p>
      <p className={cn("mt-1 text-xs", tones.msg)}>{message}</p>
    </div>
  );
}
