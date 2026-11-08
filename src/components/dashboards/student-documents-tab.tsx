"use client";

/**
 * StudentDocumentsTab — the student's own "Documents & Downloads" tab,
 * the mirror of the teacher's Documents tab. Everything the student can
 * SEE in the dashboard they can also DOWNLOAD here as an Excel-ready
 * CSV (UTF-8 BOM added by the shared downloader → Bangla names open
 * correctly in Excel):
 *
 * 1. My Weekly Routine      4. My Assignments
 * 2. My Attendance Ledger   5. Department Notices
 * 3. My Marksheet           6. Academic Calendar
 *
 * COST GUARD: one GET per download; CSV is built server-side.
 */

import { useState } from "react";
import {
  Award,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Loader2,
  Megaphone,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiGet } from "@/lib/api-client";
import { downloadCsvText } from "@/lib/csv";
import { GRADIENT_BTN, SectionCard } from "@/components/dashboards/dashboard-shared";
import { Button } from "@/components/ui/button";

function StudentDocCard({
  icon: Icon,
  title,
  description,
  onDownload,
  downloading,
}: {
  icon: typeof FileSpreadsheet;
  title: string;
  description: string;
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/25">
          <Icon className="h-5 w-5 text-[#8A7000] dark:text-gold" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Button className={GRADIENT_BTN} onClick={onDownload} disabled={downloading}>
        {downloading ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-1.5 h-4 w-4" />
        )}
        {downloading ? "Preparing…" : "Download CSV"}
      </Button>
    </div>
  );
}

export function StudentDocumentsTab() {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function run(key: string, type: string) {
    setBusyKey(key);
    try {
      const res = await apiGet<{ filename: string; csv: string }>(
        `/api/student/export?type=${encodeURIComponent(type)}`
      );
      downloadCsvText(res.filename, res.csv);
      toast({ title: "Download started", description: res.filename });
    } catch (err) {
      toast({
        title: "Couldn't export",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  }

  const docs: {
    key: string;
    type: string;
    icon: typeof FileSpreadsheet;
    title: string;
    description: string;
  }[] = [
    {
      key: "routine",
      type: "routine",
      icon: CalendarDays,
      title: "My Weekly Routine",
      description: "All your classes — day, time, room and teacher, one printable sheet.",
    },
    {
      key: "attendance",
      type: "attendance",
      icon: FileSpreadsheet,
      title: "My Attendance Ledger",
      description: "Per-subject summary + every class day marked P/A/L/E, filterable in Excel.",
    },
    {
      key: "results",
      type: "results",
      icon: Award,
      title: "My Marksheet",
      description: "Every published result — CT, midterm, final — with grades and percentages.",
    },
    {
      key: "assignments",
      type: "assignments",
      icon: ClipboardList,
      title: "My Assignments",
      description: "Assignments from your courses with due dates and max marks.",
    },
    {
      key: "notices",
      type: "notices",
      icon: Megaphone,
      title: "Department Notices",
      description: "Notices addressed to you — titles, categories and full content.",
    },
    {
      key: "calendar",
      type: "calendar",
      icon: CalendarRange,
      title: "Academic Calendar",
      description: "Upcoming exams, holidays and events from your university and department.",
    },
  ];

  return (
    <div className="mt-4 space-y-4">
      <SectionCard
        title="Documents & Downloads"
        icon={FileSpreadsheet}
        action={
          <span className="hidden text-[11px] text-muted-foreground sm:block">
            Excel-ready CSV · one click each
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {docs.map((d) => (
            <StudentDocCard
              key={d.key}
              icon={d.icon}
              title={d.title}
              description={d.description}
              downloading={busyKey === d.key}
              onDownload={() => void run(d.key, d.type)}
            />
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-snug text-muted-foreground">
          Downloads contain only YOUR data (or notices/calendar addressed to you) — your classmates'
          marks and attendance are never included.
        </p>
      </SectionCard>
    </div>
  );
}
