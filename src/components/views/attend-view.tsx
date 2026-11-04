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
  MapPin,
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
  geoRequired?: boolean;
  serverTime: string;
}

type Result = "success" | "already" | "corrected" | null;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

/** ms → "mm:ss" (clamped at 00:00) for the check-in countdown */
function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* Anti-fraud device id: stable random id per phone (localStorage).
   The server blocks one device from checking in two different
   students of the same class-date. */
function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function getDeviceId(): string {
  try {
    let id = localStorage.getItem("uh_device_id");
    if (!id) {
      id = randomId();
      localStorage.setItem("uh_device_id", id);
    }
    return id;
  } catch {
    // Storage blocked (private mode, permissions…). A shared constant
    // like "anon-device" would lock EVERY such device out after the
    // first check-in — hand out a fresh throwaway id per page load
    // instead. The device guard still works within this session.
    return randomId();
  }
}

/** One-shot browser position fix; resolves null when unavailable/denied. */
function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 20000 }
    );
  });
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

  /* geo-fence state: coords are requested up-front when the teacher
     enabled the location check, so the permission prompt appears while
     the student is still reading the page. */
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoDenied, setGeoDenied] = useState(false);
  /* Auto-attempt geolocation ONCE per mount — when it fails, `coords`
     stays null, so re-triggering off `!coords && !geoBusy` alone would
     loop forever. After the first try only the "Retry location" button
     (or the check-in fallback) asks again. */
  const autoGeoTriedRef = useRef(false);

  /* countdown to the window close — server-clock aware */
  const [nowTick, setNowTick] = useState<number | null>(null);
  const [clockSkew, setClockSkew] = useState(0);

  const load = useCallback(async () => {
    if (!token) {
      setLoadErr("This link has no QR token. Scan the QR shown in your classroom.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiGet<ScanInfo>(
        `/api/attendance/scan?token=${encodeURIComponent(token)}`,
        { skipAuthRedirect: true } // public scan page — never bounce to login
      );
      setInfo(data);
      setLoadErr(null);
      // remember how far the server clock is ahead of this device so the
      // countdown matches the teacher's window, not the phone's clock
      const serverMs = Date.parse(data.serverTime);
      if (Number.isFinite(serverMs)) setClockSkew(serverMs - Date.now());
    } catch (err) {
      setLoadErr(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Ask for the position as soon as we know the window needs it */
  const askGeo = useCallback(async () => {
    setGeoBusy(true);
    const pos = await getPosition();
    setCoords(pos);
    setGeoDenied(!pos);
    setGeoBusy(false);
  }, []);

  useEffect(() => {
    if (
      info?.geoRequired &&
      info.state === "active" &&
      !coords &&
      !geoBusy &&
      !autoGeoTriedRef.current
    ) {
      autoGeoTriedRef.current = true;
      void askGeo();
    }
  }, [info, coords, geoBusy, askGeo]);

  /* a fresh QR token (new scan) gets a fresh auto-attempt */
  useEffect(() => {
    autoGeoTriedRef.current = false;
  }, [token]);

  /* tick every second while the window is open so the countdown runs */
  useEffect(() => {
    if (info?.state !== "active") {
      setNowTick(null);
      return;
    }
    setNowTick(Date.now());
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [info?.state]);

  const markPresent = useCallback(async () => {
    if (!token || marking || markedOnce.current) return;
    setMarking(true);
    setMarkErr(null);
    try {
      // If the teacher enabled the location check, make sure we carry a
      // position (second attempt in case the first was denied).
      let pos = coords;
      if (info?.geoRequired && !pos) {
        pos = await getPosition();
        setCoords(pos);
        if (!pos) setGeoDenied(true);
      }
      const data = await apiPost<{ already: boolean; corrected?: boolean }>(
        "/api/attendance/scan",
        {
          token,
          ...(pos ? { lat: pos.lat, lng: pos.lng } : {}),
          deviceId: getDeviceId(),
        },
        { skipAuthRedirect: true } // inline login below handles auth itself
      );
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
  }, [token, marking, load, coords, info]);

  const loginAndMark = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!token) return;
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
        await apiPost(
          "/api/auth/student-login",
          {
            universitySlug: info.universitySlug,
            studentIdNumber: idNumber.trim(),
            rollNumber: roll.trim(),
          },
          { skipAuthRedirect: true } // wrong credentials must not bounce away with the QR token
        );
        await refreshAuth();
        // Re-sync the scan state: the window may have expired (410) while
        // the student was typing — surface the expired card instead of a
        // raw error from the mark call.
        let fresh: ScanInfo | null = null;
        try {
          fresh = await apiGet<ScanInfo>(
            `/api/attendance/scan?token=${encodeURIComponent(token)}`,
            { skipAuthRedirect: true }
          );
          setInfo(fresh);
          setLoadErr(null);
        } catch {
          /* keep showing the previous info card */
        }
        setLoggingIn(false);
        // intent of the scan = be marked present → auto-mark right after
        // login, but only if the window is still open and we're not in yet
        if (fresh && fresh.state === "active" && !fresh.myStatus) {
          void markPresent();
        }
      } catch (err) {
        setLoginErr(errMsg(err));
        setLoggingIn(false);
      }
    },
    [token, info, idNumber, roll, refreshAuth, markPresent]
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
        title="Something went wrong"
        message={loadErr ?? "This QR code is not valid."}
      />
    );
  }

  const isStudent = user?.role === "student";
  const geoBlocking = !!info.geoRequired && !coords;
  const remainingMs =
    info.state === "active" && nowTick !== null
      ? Date.parse(info.expiresAt) - (nowTick + clockSkew)
      : null;
  const countdownVisible = remainingMs != null && Number.isFinite(remainingMs);

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
          {countdownVisible && (
            <span
              className={cn(
                "ml-auto inline-flex items-center gap-1 font-semibold tabular-nums",
                (remainingMs as number) < 5 * 60_000
                  ? "text-[#C8442E] dark:text-[#E55A3F]"
                  : "text-[#2D4F35] dark:text-[#7FB08F]"
              )}
              aria-label="Time left to check in"
            >
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {mmss(remainingMs as number)} left
            </span>
          )}
          <span
            className={cn(
              "font-semibold text-[#2D4F35] dark:text-[#7FB08F]",
              !countdownVisible && "ml-auto"
            )}
          >
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
                <p className="mb-1 text-lg font-bold">Hi {user?.fullName?.split(" ")[0] ?? "there"} 👋</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  Confirm your presence for <span className="font-semibold">{info.courseCode}</span>
                </p>

                {info.geoRequired && (
                  <div
                    className={cn(
                      "mx-auto mb-4 flex max-w-xs items-start gap-2 rounded-xl border px-3 py-2.5 text-left",
                      coords
                        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                        : "border-amber-300/60 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                    )}
                  >
                    <MapPin
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        coords ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                      )}
                    />
                    <div className="min-w-0 text-xs">
                      {geoBusy ? (
                        <p className="font-medium text-amber-700 dark:text-amber-300">
                          Getting your location… stay inside the classroom.
                        </p>
                      ) : coords ? (
                        <p className="font-medium text-emerald-700 dark:text-emerald-300">
                          Location locked — you can check in from inside the class area.
                        </p>
                      ) : (
                        <p className="font-medium text-amber-800 dark:text-amber-300">
                          {geoDenied
                            ? "Location is off or blocked. Allow location for this site and try again — check-in without it is not possible."
                            : "This check-in verifies you are inside the classroom area."}
                        </p>
                      )}
                      {!coords && !geoBusy && (
                        <button
                          type="button"
                          onClick={() => void askGeo()}
                          className="mt-1 font-semibold text-amber-900 underline underline-offset-2 dark:text-amber-200"
                        >
                          Retry location
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <Button
                  size="lg"
                  className={cn("h-12 w-full text-base", "btn-shine bg-[#2D4F35] hover:bg-[#3A6B47] text-white shadow-md shadow-[#2D4F35]/25")}
                  onClick={() => void markPresent()}
                  disabled={marking || geoBlocking}
                >
                  {marking ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCheck className="mr-2 h-5 w-5" />}
                  {marking
                    ? "Marking you present…"
                    : geoBlocking
                      ? "Check in (location needed)"
                      : "Mark me Present"}
                </Button>
                {geoBlocking && !marking && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Waiting for your location — allow it above to enable check-in.
                  </p>
                )}
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
