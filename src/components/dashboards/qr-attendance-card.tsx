"use client";

/**
 * QRAttendanceCard — the teacher opens a short (default 2-minute) QR
 * window; students scan with their phone camera and check themselves in.
 * When the window closes, everyone who did not scan is marked absent.
 *
 * COST GUARD design (Vercel bandwidth discipline):
 *  • QR image is generated client-side from the token — zero storage,
 *    zero extra requests, nothing uploaded anywhere.
 *  • The live poll reads ONE denormalized counter row and returns
 *    <200 bytes ({st, pc, exp, recent≤3}); it polls every 3s ONLY while
 *    the window is active, and self-stops the moment it expires/closes.
 *  • Finalize is ONE POST → server-side createMany (bulk absent) —
 *    no per-student chatter.
 *  • Excel export is ONE GET that returns a small CSV string; the
 *    browser turns it into a .csv file locally.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  CheckCheck,
  Copy,
  Download,
  Loader2,
  MapPin,
  MapPinOff,
  Maximize2,
  QrCode,
  ScanLine,
  Timer,
  UserCheck,
  XCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiGet, apiPost } from "@/lib/api-client";
import { fmtDateOnly } from "@/lib/date-bd";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, GRADIENT_BTN, SectionCard } from "@/components/dashboards/dashboard-shared";

type Phase = "idle" | "active" | "expired" | "closed";

interface LiveStatus {
  st: "active" | "expired" | "closed";
  pc: number;
  exp: string;
  geo?: boolean;
  recent: { n: string; r: string | null }[];
}

const DURATIONS = [
  { value: "60", label: "1 minute" },
  { value: "120", label: "2 minutes" },
  { value: "180", label: "3 minutes" },
  { value: "300", label: "5 minutes" },
];

/* Geo-fence radius presets — generous on purpose: phone GPS indoors
   can drift 20–50m, so Room is the strictest sensible option and
   Building is the default. */
const GEO_RADII = [
  { value: "50", label: "Room · 50m" },
  { value: "150", label: "Building · 150m" },
  { value: "400", label: "Campus · 400m" },
];

function fmtLeft(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(Math.max(s, 0)).padStart(2, "0")}`;
}

export function QRAttendanceCard({
  scheduleId,
  date,
  totalStudents,
  courseLabel,
  onRosterRefresh,
}: {
  scheduleId: string;
  date: string;
  totalStudents: number;
  /** e.g. "ICE-1101 · 10:00" — shown in the fullscreen projector view */
  courseLabel?: string;
  onRosterRefresh: () => void;
}) {
  const [duration, setDuration] = useState("120");
  const [geoOn, setGeoOn] = useState(true);
  const [geoRadius, setGeoRadius] = useState("150");
  const [phase, setPhase] = useState<Phase>("idle");
  const [session, setSession] = useState<{ id: string; token: string; url: string; exp: number } | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [leftSec, setLeftSec] = useState(0);
  const [starting, setStarting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<{ present: number; absent: number; total: number } | null>(null);
  /* Fullscreen projector view — classroom displays show the QR huge */
  const [fullscreen, setFullscreen] = useState(false);
  /* Bulk "mark rest absent" runs behind a confirmation dialog */
  const [absentConfirmOpen, setAbsentConfirmOpen] = useState(false);
  const qrBoxRef = useRef<HTMLDivElement | null>(null);
  /* Server-clock skew (serverTime - clientTime, ms) sampled from the
     status poll's Date header — the countdown uses it so a laptop with
     a drifting clock can't cut the window short or stretch it. */
  const serverOffsetRef = useRef(0);
  /* Mirror of `session` for async callbacks that must not clobber a
     freshly-created local session (stale resume / supersede logic). */
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  /* Start a QR window */
  const startSession = useCallback(async () => {
    if (!scheduleId) return;
    setStarting(true);
    try {
      // Supersede safely: if a previous window for this class+date
      // expired WITHOUT being finalized, close it out first so students
      // who never scan the new code still get their absent record from
      // the old window (the server also auto-finalizes superseded
      // sessions on creation — this keeps the roster fresh right away).
      if (session && phase === "expired") {
        try {
          await apiPost<{ absentMarked: number; absentTotal: number }> (
            "/api/teacher/attendance-finalize",
            { sessionId: session.id }
          );
          onRosterRefresh();
        } catch {
          /* best-effort — never block the new window on this */
        }
      }
      // One-time position fix when location check is on (HTTPS required;
      // Vercel serves over HTTPS so this works in real classrooms).
      let coords: { lat: number; lng: number } | null = null;
      if (geoOn) {
        coords = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
          if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
          );
        });
        if (!coords) {
          toast({
            title: "Location not available",
            description:
              "Allow location access to start a location-checked QR — or turn the location check off below.",
            variant: "destructive",
          });
          setStarting(false);
          return;
        }
      }
      const data = await apiPost<{
        id: string;
        token: string;
        expiresAt: string;
        url: string;
        geo: { radiusM: number } | null;
      }>("/api/attendance/session", {
        scheduleId,
        date,
        durationSec: Number(duration),
        geoEnabled: geoOn,
        ...(coords ? { lat: coords.lat, lng: coords.lng, radiusM: Number(geoRadius) } : {}),
      });
      const shareUrl = `${window.location.origin}${data.url}`;
      const dataUrl = await QRCode.toDataURL(shareUrl, {
        width: 512,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#1c2a1f", light: "#ffffff" },
      });
      const exp = new Date(data.expiresAt).getTime();
      setSession({ id: data.id, token: data.token, url: shareUrl, exp });
      setQrData(dataUrl);
      setLive({ st: "active", pc: 0, exp: data.expiresAt, recent: [] });
      setLeftSec(Math.max(0, Math.round((exp - Date.now()) / 1000)));
      setPhase("active");
      setSummary(null);
      toast({
        title: "QR check-in is live",
        description: data.geo
          ? `Location check ON (${data.geo.radiusM}m) · students have ${Math.round(Number(duration) / 60)} minute(s) to scan from inside class.`
          : `Students have ${Math.round(Number(duration) / 60)} minute(s) to scan.`,
      });
    } catch (err) {
      toast({
        title: "Could not start QR session",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setStarting(false);
    }
  }, [scheduleId, date, duration, geoOn, geoRadius, session, phase, onRosterRefresh]);

  /* Countdown — 1s local tick, corrected for server-clock skew;
     server remains the authority */
  useEffect(() => {
    if (phase !== "active" || !session) return;
    const iv = setInterval(() => {
      const now = Date.now() + serverOffsetRef.current;
      const left = Math.round((session.exp - now) / 1000);
      setLeftSec(left);
      if (left <= 0) setPhase("expired");
    }, 1000);
    return () => clearInterval(iv);
  }, [phase, session]);

  /* Resume — if the teacher reloads the page mid-session, pick the
     still-active window back up from the server (QR rebuilt locally).
     Keyed on class AND date; stale responses are dropped when the
     teacher has already moved on or started a local session. */
  const resumedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scheduleId || !date) return;
    const key = `${scheduleId}|${date}`;
    if (resumedKeyRef.current === key) return;
    resumedKeyRef.current = key;
    let cancelled = false;
    (async () => {
      try {
        const d = await apiGet<{
          sessions: { id: string; token: string; date: string; presentCount: number; closed: boolean; expiresAt: string }[];
        }>(`/api/attendance/session?scheduleId=${encodeURIComponent(scheduleId)}`);
        // Stale guards: class/date changed again while fetching, or the
        // teacher already opened a session locally — never clobber it.
        if (cancelled || sessionRef.current) return;
        const live = d.sessions.find(
          (s) => s.date === date && !s.closed && new Date(s.expiresAt).getTime() > Date.now()
        );
        if (!live) return;
        const shareUrl = `${window.location.origin}/?view=attend&k=${live.token}`;
        const dataUrl = await QRCode.toDataURL(shareUrl, {
          width: 512,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#1c2a1f", light: "#ffffff" },
        });
        if (cancelled || sessionRef.current) return; // re-check after the QR build
        const exp = new Date(live.expiresAt).getTime();
        setSession({ id: live.id, token: live.token, url: shareUrl, exp });
        setQrData(dataUrl);
        setLive({ st: "active", pc: live.presentCount, exp: live.expiresAt, recent: [] });
        setLeftSec(Math.max(0, Math.round((exp - Date.now()) / 1000)));
        setPhase("active");
      } catch {
        /* resume is best-effort only */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scheduleId, date]);

  /* Live poll — 3s tiny fetch, ONLY while active; self-stops otherwise.
     Raw fetch (not apiGet) so the response's Date header can be read
     for server-clock skew correction. */
  useEffect(() => {
    if (phase !== "active" || !session) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/attendance/session?id=${session.id}`, {
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
        });
        const json = (await res.json()) as { success: boolean; data?: LiveStatus; error?: string };
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error || `Request failed (${res.status})`);
        }
        // Skew correction: serverTime - clientTime. Date headers are
        // absent/invalid in some odd proxies — fall back to 0 offset.
        const dateHdr = res.headers.get("date");
        const serverTime = dateHdr ? new Date(dateHdr).getTime() : NaN;
        serverOffsetRef.current = Number.isNaN(serverTime) ? 0 : serverTime - Date.now();
        if (stopped) return;
        setLive(json.data);
        if (json.data.st !== "active") setPhase(json.data.st);
      } catch {
        /* transient network error — next tick retries silently */
      }
    };
    void tick();
    const iv = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, [phase, session]);

  /* Reset the card view when the teacher switches class or date
     (declared after the resume effect: on class switch the resume's
     async result lands AFTER this synchronous reset, so a live window
     wins over the idle view). */
  useEffect(() => {
    setPhase("idle");
    setSession(null);
    setQrData(null);
    setLive(null);
    setSummary(null);
  }, [scheduleId, date]);

  const finalize = useCallback(async () => {
    if (!session) return;
    setClosing(true);
    try {
      const data = await apiPost<{ absentMarked: number; absentTotal: number; present: number; total: number }>(
        "/api/teacher/attendance-finalize",
        { sessionId: session.id }
      );
      setSummary({ present: data.present, absent: data.absentTotal, total: data.total });
      setPhase("closed");
      onRosterRefresh();
      toast({
        title: "Attendance finalized",
        description:
          data.absentMarked > 0
            ? `${data.present} present · ${data.absentMarked} newly absent (notified) · ${data.total} total.`
            : `${data.present} present · ${data.absentTotal} absent · ${data.total} total.`,
      });
    } catch (err) {
      toast({
        title: "Could not finalize",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setClosing(false);
    }
  }, [session, onRosterRefresh]);

  /* finalize is destructive (bulk-absent + notifications) — every
     "Close & mark rest absent" button opens the confirm dialog first. */
  const requestFinalize = useCallback(() => setAbsentConfirmOpen(true), []);
  const confirmFinalize = useCallback(async () => {
    await finalize();
    setAbsentConfirmOpen(false);
  }, [finalize]);

  const copyLink = useCallback(async () => {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.url);
      toast({ title: "Link copied", description: "Share it if someone cannot scan the QR." });
    } catch {
      toast({ title: "Copy failed", description: session.url, variant: "destructive" });
    }
  }, [session]);

  const exportCsv = useCallback(async () => {
    if (!scheduleId) return;
    setExporting(true);
    try {
      const data = await apiGet<{ filename: string; csv: string; total: number; marked: number }>(
        `/api/teacher/attendance-export?scheduleId=${encodeURIComponent(scheduleId)}&date=${encodeURIComponent(date)}`
      );
      // UTF-8 BOM → Excel renders Bangla student names correctly
      const blob = new Blob([`\uFEFF${data.csv}`], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: "Excel sheet downloaded", description: `${data.marked}/${data.total} marked rows.` });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }, [scheduleId, date]);

  const scanned = live?.pc ?? 0;
  const pct = totalStudents > 0 ? Math.min(100, Math.round((scanned / totalStudents) * 100)) : 0;

  return (
    <>
    <SectionCard
      title="QR Self Check-in"
      icon={QrCode}
      action={
        scheduleId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => void exportCsv()}
            disabled={exporting}
          >
            {exporting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
            Excel sheet
          </Button>
        ) : undefined
      }
    >
      {!scheduleId ? (
        <EmptyState
          icon={QrCode}
          title="Select a class above"
          hint="Pick a class and date, then open a QR check-in window — students scan and mark themselves present."
        />
      ) : phase === "idle" ? (
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-md space-y-1.5">
            <p className="text-sm font-semibold">Let students check themselves in</p>
            <p className="text-xs text-muted-foreground">
              Project the QR on screen — students scan it with their phone camera and are
              marked <span className="font-semibold text-emerald-600 dark:text-emerald-400">present</span> instantly.
              When you close the window, everyone who didn&apos;t scan is marked absent and notified automatically.
            </p>
            {totalStudents === 0 && (
              <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                No students enrolled in this class batch yet — the QR button stays disabled until at least one student matches.
              </p>
            )}
          </div>
          <div className="w-full space-y-3 sm:w-auto">
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-32 space-y-1.5">
                <Label htmlFor="qr-duration">Window</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger id="qr-duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {geoOn && (
                <div className="w-40 space-y-1.5">
                  <Label htmlFor="qr-radius">Radius</Label>
                  <Select value={geoRadius} onValueChange={setGeoRadius}>
                    <SelectTrigger id="qr-radius">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GEO_RADII.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                className={cn(GRADIENT_BTN, "h-9 flex-1 sm:flex-none")}
                onClick={() => void startSession()}
                disabled={starting || totalStudents === 0}
              >
                {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                Start QR
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3 py-2.5 sm:justify-start">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  {geoOn ? (
                    <>
                      <MapPin className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      Location check
                    </>
                  ) : (
                    <>
                      <MapPinOff className="h-3.5 w-3.5 text-muted-foreground" />
                      Location check
                    </>
                  )}
                </p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {geoOn
                    ? "Only students inside the area can check in — no check-in from home."
                    : "Anyone with the code can check in — location not verified."}
                </p>
              </div>
              <Switch
                aria-label="Toggle location check"
                checked={geoOn}
                onCheckedChange={setGeoOn}
              />
            </div>
          </div>
        </div>
      ) : phase === "active" ? (
        <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:gap-6">
          {/* QR box */}
          <div ref={qrBoxRef} className="mx-auto flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              aria-label="Show QR fullscreen for the projector"
              title="Tap to enlarge — best for projecting on the classroom screen"
              className="group relative rounded-2xl border-2 border-[#2D4F35]/25 bg-white p-2 shadow-lg shadow-[#2D4F35]/10 transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2D4F35]"
            >
              {qrData && (
                <img src={qrData} alt="Attendance check-in QR code" className="h-40 w-40 sm:h-48 sm:w-48" />
              )}
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[#2D4F35] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                Scan me
              </span>
              <span className="absolute -bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#241C15] px-2.5 py-0.5 text-[10px] font-bold text-[#FFE01B] opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                <Maximize2 className="h-3 w-3" /> Enlarge
              </span>
            </button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setFullscreen(true)}
            >
              <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
              Fullscreen
            </Button>
            <p className="max-w-[200px] break-all text-center text-[10px] leading-tight text-muted-foreground">
              {session?.url}
            </p>
          </div>

          {/* Live status */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <Timer className="h-4 w-4 animate-pulse" />
                {fmtLeft(leftSec)} left
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green/10 px-3 py-1 text-sm font-bold text-green">
                <UserCheck className="h-4 w-4" />
                {scanned}/{totalStudents} scanned
              </span>
              {live?.geo && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <MapPin className="h-3 w-3" />
                  Location · {geoRadius}m
                </span>
              )}
            </div>

            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#2D4F35] to-[#4A7C58] transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>

            {live && live.recent.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {live.recent.map((r, i) => (
                  <span
                    key={`${r.n}-${i}`}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    <ScanLine className="h-3 w-3" />
                    {r.n}
                    {r.r ? ` · ${r.r}` : ""}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-9" onClick={() => void copyLink()}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy link
              </Button>
              <Button
                size="sm"
                className={cn(GRADIENT_BTN, "h-9")}
                onClick={requestFinalize}
                disabled={closing}
              >
                {closing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
                Close & mark rest absent
              </Button>
            </div>
          </div>
        </div>
      ) : phase === "expired" ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                Window expired — students who didn&apos;t scan are still unmarked
              </p>
              <p className="text-xs text-amber-700/90 dark:text-amber-400/80">
                {scanned} of {totalStudents} scanned so far. Mark the rest absent now (they get an
                automatic notification), or open a fresh QR window for latecomers.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className={cn(GRADIENT_BTN, "h-9")} onClick={requestFinalize} disabled={closing}>
              {closing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
              Mark rest absent
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => void startSession()} disabled={starting}>
              {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
              New QR window
            </Button>
          </div>
        </div>
      ) : (
        /* closed */
        summary && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
              <CheckCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                Session closed — {summary.present} present · {summary.absent} absent · {summary.total} total
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-9" onClick={() => void startSession()} disabled={starting}>
              {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
              Open another QR window
            </Button>
          </div>
        )
      )}
    </SectionCard>

    {/* ---------- Fullscreen projector view ---------- */}
    <Dialog open={fullscreen} onOpenChange={setFullscreen}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Attendance QR — fullscreen</DialogTitle>
          <DialogDescription>
            Show this enlarged code on the classroom projector so every student can scan it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <div className="w-full rounded-2xl bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] px-4 py-3 text-center text-white shadow-md">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-80">
              {courseLabel ?? "Class attendance"} · {fmtDateOnly(date)}
            </p>
            <p className="flex items-center justify-center gap-2 text-sm font-semibold">
              <Timer className="h-4 w-4" /> {fmtLeft(leftSec)} left
              <span aria-hidden>·</span>
              <UserCheck className="h-4 w-4" /> {scanned}/{totalStudents}
              {live?.geo && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px]">
                  <MapPin className="h-3 w-3" /> {geoRadius}m
                </span>
              )}
            </p>
          </div>
          {qrData && (
            <img
              src={qrData}
              alt="Attendance check-in QR code, enlarged"
              className="h-[52vh] max-h-[460px] w-auto max-w-full rounded-2xl border-4 border-[#2D4F35]/20 bg-white p-3 shadow-xl"
            />
          )}
          <p className="break-all text-center text-[11px] text-muted-foreground">{session?.url}</p>
          <div className="flex w-full flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={() => void copyLink()}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
            </Button>
            <Button
              size="sm"
              className={cn(GRADIENT_BTN, "h-9")}
              onClick={() => {
                setFullscreen(false);
                requestFinalize();
              }}
              disabled={closing}
            >
              {closing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
              Close & mark rest absent
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Bulk absent confirmation — shared by all finalize entry points */}
    <AlertDialog open={absentConfirmOpen} onOpenChange={setAbsentConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark remaining students absent?</AlertDialogTitle>
          <AlertDialogDescription>
            Everyone who hasn&apos;t scanned will be marked absent and notified. This can&apos;t be
            undone from the app.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={closing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-rose-600 text-white hover:bg-rose-700"
            disabled={closing}
            onClick={(e) => {
              e.preventDefault();
              void confirmFinalize();
            }}
          >
            {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Mark absent
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
