"use client";

/**
 * SuperAdminSystemCard — the global admin's platform-control panel.
 *
 * • Live row counts for every model (platform health at a glance)
 * • The data-retention policy in plain numbers
 * • "Run retention sweep now" — triggers the same idempotent retention
 *   sweep the daily cron uses, so the admin never waits for 3:00 AM.
 *
 * COST GUARD: one GET of bounded counts on tab open, one POST per
 * manual sweep.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Database,
  FileText,
  GraduationCap,
  Layers,
  Loader2,
  Megaphone,
  QrCode,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiGet, apiPost } from "@/lib/api-client";
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
import { EmptyState, SectionCard } from "@/components/dashboards/dashboard-shared";

interface SystemResponse {
  counts: {
    universities: number;
    departments: number;
    users: number;
    teachers: number;
    students: number;
    schedules: number;
    notices: number;
    assignments: number;
    results: number;
    attendance: number;
    attendanceSessions: number;
    notifications: number;
    scheduleChanges: number;
  };
  retention: {
    attendanceSessionDays: number;
    notificationsReadDays: number;
    notificationsUnreadDays: number;
    scheduleChangeDays: number;
    autoNoticeDays: number;
    expiredNoticeDays: number;
    calendarDays: number;
  };
}

/* POST /api/maintenance/cleanup contract: { ranAt, counts: {...}, durationMs }.
   counts is a name→rows map — unknown future keys still add to the total. */
interface CleanupResult {
  ranAt: string;
  counts: Record<string, number>;
  durationMs: number;
}

/* Human-readable labels for the sweep counters we know about. */
const SWEEP_COUNT_LABELS: Record<string, string> = {
  attendanceSessions: "QR sessions",
  notificationsRead: "Read notifications",
  notificationsUnread: "Unread notifications",
  scheduleChangesDeleted: "Changes deleted",
  scheduleChangesDeactivated: "Changes deactivated",
  autoNotices: "Auto notices",
  expiredNotices: "Expired notices",
  calendarEvents: "Calendar events",
};

export function SuperAdminSystemCard() {
  const [data, setData] = useState<SystemResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [sweepOpen, setSweepOpen] = useState(false);
  const [lastSweep, setLastSweep] = useState<CleanupResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiGet<SystemResponse>("/api/admin/system"));
    } catch (err) {
      toast({
        title: "Could not load system stats",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runSweep = useCallback(async () => {
    setSweeping(true);
    try {
      const d = await apiPost<CleanupResult>("/api/maintenance/cleanup", {});
      setLastSweep(d);
      // Sum EVERY returned counter — deactivated schedule changes are rows
      // purged from the active set too, and unknown future keys stay honest.
      const total = Object.values(d.counts ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
      toast({
        title: `Cleanup complete — ${total} row${total === 1 ? "" : "s"} purged`,
        description:
          `Finished in ${(d.durationMs / 1000).toFixed(1)}s. The database stays small; permanent records are never touched.`,
      });
      void load();
    } catch (err) {
      toast({
        title: "Cleanup failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSweeping(false);
    }
  }, [load]);

  /* Bulk deletion — confirmed via AlertDialog before it touches rows. */
  const confirmSweep = useCallback(async () => {
    await runSweep();
    setSweepOpen(false);
  }, [runSweep]);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Platform health"
        icon={Activity}
        action={
          <button
            type="button"
            aria-label="Refresh system stats"
            onClick={() => void load()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        }
      >
        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Counting rows…
          </div>
        ) : !data ? (
          <EmptyState
            icon={Activity}
            title="Stats unavailable"
            hint="Use the Refresh button above to try again."
          />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            <HealthTile icon={Building2} label="Universities" value={data.counts.universities} />
            <HealthTile icon={Layers} label="Departments" value={data.counts.departments} />
            <HealthTile icon={Users} label="Users total" value={data.counts.users} />
            <HealthTile icon={GraduationCap} label="Teachers" value={data.counts.teachers} />
            <HealthTile icon={Users} label="Students" value={data.counts.students} />
            <HealthTile icon={CalendarDays} label="Active routines" value={data.counts.schedules} />
            <HealthTile icon={ClipboardCheck} label="Attendance records" value={data.counts.attendance} />
            <HealthTile icon={QrCode} label="QR sessions" value={data.counts.attendanceSessions} />
            <HealthTile icon={Megaphone} label="Notices" value={data.counts.notices} />
            <HealthTile icon={FileText} label="Assignments" value={data.counts.assignments} />
            <HealthTile icon={BookOpen} label="Results" value={data.counts.results} />
            <HealthTile icon={ScrollText} label="Class changes" value={data.counts.scheduleChanges} />
            <HealthTile icon={Sparkles} label="Notifications" value={data.counts.notifications} />
          </div>
        )}
      </SectionCard>

      <SectionCard title="Data retention & cleanup" icon={Database}>
        {data ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Automatic rules (daily sweep at 3:00 + lazy 24h trigger)
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• QR sessions — deleted after <b className="text-foreground">{data.retention.attendanceSessionDays} days</b> (attendance rows are the permanent record)</li>
                <li>• Notifications — read after <b className="text-foreground">{data.retention.notificationsReadDays} days</b>, unread after <b className="text-foreground">{data.retention.notificationsUnreadDays} days</b></li>
                <li>• Class changes — deleted after <b className="text-foreground">{data.retention.scheduleChangeDays} days</b>, deactivated after 45</li>
                <li>• Auto-generated notices after <b className="text-foreground">{data.retention.autoNoticeDays} days</b> · expired manual notices +<b className="text-foreground">{data.retention.expiredNoticeDays} days</b></li>
                <li>• Ended calendar events after <b className="text-foreground">{data.retention.calendarDays} days</b></li>
              </ul>
              <p className="mt-2 text-[11px] font-medium text-green">
                Permanent records (attendance, results, users, routines) are never auto-deleted.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Destructive-subtle: this purges expired rows platform-wide,
                  so it reads as a warning action, not a primary one. */}
              <button
                type="button"
                onClick={() => setSweepOpen(true)}
                disabled={sweeping}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 shadow-sm transition-colors hover:bg-rose-100 disabled:opacity-60 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/50"
              >
                {sweeping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {sweeping ? "Sweeping…" : "Run retention sweep now"}
              </button>
              <span className="text-[11px] text-muted-foreground">
                Same idempotent sweep the daily cron runs — safe to repeat anytime.
              </span>
            </div>

            {lastSweep && (
              <div className="rounded-xl border border-dashed p-3 text-xs">
                <p className="mb-1.5 font-bold">
                  Last manual sweep ({fmtSweepTime(lastSweep.ranAt)})
                  {lastSweep.durationMs > 0 && ` · ${(lastSweep.durationMs / 1000).toFixed(1)}s`}
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-4">
                  {Object.entries(lastSweep.counts ?? {})
                    .filter(([, n]) => Number(n) > 0)
                    .map(([key, n]) => (
                      <span key={key}>
                        {SWEEP_COUNT_LABELS[key] ?? key}: <b className="text-foreground">{n}</b>
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading retention rules…
          </div>
        )}
      </SectionCard>

      <SectionCard title="Platform guarantees" icon={ShieldCheck}>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li>• <b className="text-foreground">Multi-tenant isolation</b> — every query is scoped by university/department; tenants can never read each other&apos;s data.</li>
          <li>• <b className="text-foreground">Role guards</b> — teacher/student APIs reject cross-department and cross-role access (403).</li>
          <li>• <b className="text-foreground">Super Admin protection</b> — global admin accounts cannot be edited or deactivated from the Users tab.</li>
          <li>• <b className="text-foreground">Cost guardrails</b> — every list endpoint is bounded; heavy grids load once per open; the retention sweep keeps Turso rows minimal.</li>
        </ul>
      </SectionCard>

      {/* retention cleanup confirmation — bulk purge is destructive-ish */}
      <AlertDialog open={sweepOpen} onOpenChange={setSweepOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run retention sweep now?</AlertDialogTitle>
            <AlertDialogDescription>
              This purges expired QR attendance sessions, read notifications, old notices and ended
              calendar events platform-wide — across every university — per the retention rules
              above. Permanent records (attendance, results, users, routines) are never touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sweeping}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={sweeping}
              onClick={(e) => {
                e.preventDefault();
                void confirmSweep();
              }}
            >
              {sweeping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Run cleanup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* Sweep timestamps are absolute instants — render them on the university's
   Asia/Dhaka clock so the "swept at 3:00" retention story reads consistently
   no matter where the admin is sitting. */
function fmtSweepTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dhaka",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d) + " (Dhaka)";
}

function HealthTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border bg-card p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/25">
        <Icon className="h-4 w-4 text-[#8A7000] dark:text-gold" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="font-display text-xl leading-tight">{value.toLocaleString("en-US")}</p>
      </div>
    </div>
  );
}
