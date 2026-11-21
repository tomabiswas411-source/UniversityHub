"use client";

/**
 * Notification Delivery log (Phase 4, D51) — what actually reached this
 * department's people over the last 30 days. Rendered inside the dept
 * admin's Notices tab; data comes from GET /api/manage/notification-stats.
 */

import { useCallback, useEffect, useState } from "react";
import { BellRing, Eye, Inbox, Users } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/dashboards/dashboard-shared";
import { HBarChart, StatPill } from "@/components/dashboards/analytics-charts";
import { timeAgo } from "@/components/shared/notification-bell";
import { apiGet } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";

interface NotificationStats {
  windowDays: number;
  total: number;
  read: number;
  byType: { label: string; value: number }[];
  deliveries: {
    title: string;
    type: string;
    recipients: number;
    latest: string;
    read: number;
  }[];
}

const TYPE_LABELS: Record<string, string> = {
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  room_changed: "Room moved",
  time_changed: "Time moved",
  extra_class: "Extra class",
  assignment: "Assignment",
  result: "Result",
  notice: "Notice",
  general: "General",
};

const TYPE_BADGE: Record<string, string> = {
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  rescheduled: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  time_changed: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  room_changed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  extra_class: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  assignment: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  result: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  notice: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  general: "bg-muted text-muted-foreground",
};

export function NotificationDeliveryCard({ departmentId }: { departmentId: string }) {
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    try {
      const v = await apiGet<NotificationStats>(
        `/api/manage/notification-stats?departmentId=${departmentId}`
      );
      setStats(v);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <SectionCard title="Notification Delivery (30 days)" icon={BellRing}>
        <p className="py-2 text-sm text-muted-foreground">Loading delivery log…</p>
      </SectionCard>
    );
  }

  if (error || !stats) {
    return (
      <SectionCard title="Notification Delivery (30 days)" icon={BellRing}>
        <div className="flex flex-col items-start gap-2 py-2">
          <p className="text-sm text-muted-foreground">{error ?? "No data"}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs font-semibold text-[#2D4F35] underline-offset-2 hover:underline dark:text-[#7FB08F]"
          >
            Retry
          </button>
        </div>
      </SectionCard>
    );
  }

  const readRate = stats.total > 0 ? Math.round((stats.read / stats.total) * 100) : null;

  return (
    <SectionCard title="Notification Delivery (30 days)" icon={BellRing}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatPill label="Delivered" value={stats.total} tone="navy" />
          <StatPill label="Opened" value={readRate === null ? "—" : `${readRate}%`} tone="green" />
          <StatPill label="Bursts" value={stats.deliveries.length} tone="gold" />
          <StatPill label="Types Used" value={stats.byType.length} tone="navy" />
        </div>

        {stats.total === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nothing delivered yet"
            hint="Fan-outs from notices, class changes and assignments will appear here."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="h-56">
                <HBarChart
                  data={stats.byType.map((t) => ({ label: TYPE_LABELS[t.label] ?? t.label, value: t.value }))}
                  color="#1B3358"
                  hint="Rows are per-recipient messages over the last 30 days."
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Delivery burst</th>
                      <th className="px-2 py-2 text-center font-medium"><Users className="inline h-3.5 w-3.5" aria-label="Recipients" /></th>
                      <th className="px-2 py-2 text-center font-medium"><Eye className="inline h-3.5 w-3.5" aria-label="Opened" /></th>
                      <th className="px-3 py-2 text-right font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.deliveries.map((d) => (
                      <tr key={`${d.type}-${d.title}`} className="border-t">
                        <td className="max-w-0 px-3 py-2">
                          <p className="truncate font-medium">{d.title}</p>
                          <Badge className={cnBadge(d.type)}>{TYPE_LABELS[d.type] ?? d.type}</Badge>
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums">{d.recipients}</td>
                        <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{d.read}</td>
                        <td className="px-3 py-2 text-right text-[11px] text-muted-foreground">{timeAgo(d.latest)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Each burst is one fan-out event (notice, class change or assignment update) — the recipient count is how many inboxes it landed in, &quot;opened&quot; is how many have been read.
            </p>
          </>
        )}
      </div>
    </SectionCard>
  );
}

function cnBadge(type: string): string {
  return `inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[type] ?? TYPE_BADGE.general}`;
}
