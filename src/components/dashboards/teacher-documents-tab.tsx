"use client";

/* ============================================================
 TeacherDocumentsTab — every document a teacher needs, one
 click away. All exports are built server-side into a single
 small CSV string (COST GUARD) and downloaded client-side as
 an Excel-ready .csv file (UTF-8 BOM → Bangla names open
 correctly in Excel).

 Documents:
 1. My Weekly Schedule
 2. Student List (by course batch)
 3. Attendance Master Sheet (Excel-style: rows=students, cols=dates)
 4. Attendance Day Sheet (one class · one date)
 5. Results Sheet (by course)
 6. Assignments List
 7. Class Change History
 8. My Notices
============================================================ */

import { useState, type ReactNode } from "react";
import {
 CalendarDays,
 ClipboardList,
 Download,
 FileSpreadsheet,
 FileText,
 GraduationCap,
 History,
 Loader2,
 Megaphone,
 UserCheck,
 Users,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiGet } from "@/lib/api-client";
import { GRADIENT_BTN, SectionCard } from "@/components/dashboards/dashboard-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import type { CourseDTO, ScheduleDTO } from "@/types";

/* Shared CSV downloader — UTF-8 BOM keeps Bangla names intact in Excel */
export function downloadCsv(filename: string, csv: string) {
 const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = filename;
 document.body.appendChild(a);
 a.click();
 a.remove();
 URL.revokeObjectURL(url);
}

function todayISO(): string {
 const now = new Date();
 return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

type IconType = typeof FileText;

function DocCard({
 icon: Icon,
 title,
 description,
 children,
 onDownload,
 downloading,
 disabled,
}: {
 icon: IconType;
 title: string;
 description: string;
 children?: ReactNode;
 onDownload: () => void;
 downloading: boolean;
 disabled?: boolean;
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
 {children}
 <Button className={GRADIENT_BTN} onClick={onDownload} disabled={downloading || disabled}>
 {downloading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
 {downloading ? "Preparing…" : "Download CSV"}
 </Button>
 </div>
 );
}

function useDownloader() {
 const [busyKey, setBusyKey] = useState<string | null>(null);
 async function run(key: string, query: string) {
 setBusyKey(key);
 try {
 const res = await apiGet<{ filename: string; csv: string }>(`/api/teacher/export?${query}`);
 downloadCsv(res.filename, res.csv);
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
 return { busyKey, run };
}

/** Per-card control state for the Documents tab. Lives in the parent
 *  panel so switching tabs doesn't reset the teacher's selections. */
export type DocumentsScopeState = {
  studentCourseId: string;
  matrixScheduleId: string;
  dayScheduleId: string;
  dayDate: string;
  resultsCourseId: string;
};

export function TeacherDocumentsTab({
 courses,
 schedules,
 scope,
 onScopeChange,
}: {
 courses: CourseDTO[];
 schedules: ScheduleDTO[];
 /** Lifted control state — owned by the parent panel. */
 scope: DocumentsScopeState;
 /** Patch-style updater so call sites stay one-liners. */
 onScopeChange: (patch: Partial<DocumentsScopeState>) => void;
}) {
 const { busyKey, run } = useDownloader();

 /* per-card control state (lifted; first option pre-highlighted) */
 const studentCourseId = scope.studentCourseId || courses[0]?.id || "";
 const matrixScheduleId = scope.matrixScheduleId || schedules[0]?.id || "";
 const dayScheduleId = scope.dayScheduleId || schedules[0]?.id || "";
 const dayDate = scope.dayDate || todayISO();
 const resultsCourseId = scope.resultsCourseId || courses[0]?.id || "";

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
 <DocCard
 icon={CalendarDays}
 title="My Weekly Schedule"
 description="All your classes — day, time, room, program & semester."
 downloading={busyKey === "schedule"}
 onDownload={() => void run("schedule", "type=schedule")}
 />

 <DocCard
 icon={Users}
 title="Student List"
 description="Roster of a course batch — roll, ID, contact, status."
 downloading={busyKey === "students"}
 onDownload={() => void run("students", `type=students&courseId=${encodeURIComponent(studentCourseId)}`)}
 disabled={!studentCourseId}
 >
 <div className="space-y-1.5">
 <Label htmlFor="doc-student-course" className="text-xs">Course batch</Label>
 <Select value={studentCourseId} onValueChange={(v) => onScopeChange({ studentCourseId: v })}>
 <SelectTrigger id="doc-student-course" className="h-9">
 <SelectValue placeholder="Pick a course" />
 </SelectTrigger>
 <SelectContent>
 {courses.map((c) => (
 <SelectItem key={c.id} value={c.id}>
 {c.code} · Sem {c.semester}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </DocCard>

 <DocCard
 icon={FileSpreadsheet}
 title="Attendance Master Sheet"
 description="Excel-style: one row per student, one column per class date (P/A/L/E) + totals."
 downloading={busyKey === "attendance-matrix"}
 onDownload={() => void run("attendance-matrix", `type=attendance-matrix&scheduleId=${encodeURIComponent(matrixScheduleId)}`)}
 disabled={!matrixScheduleId}
 >
 <div className="space-y-1.5">
 <Label htmlFor="doc-matrix-class" className="text-xs">Class</Label>
 <Select value={matrixScheduleId} onValueChange={(v) => onScopeChange({ matrixScheduleId: v })}>
 <SelectTrigger id="doc-matrix-class" className="h-9">
 <SelectValue placeholder="Pick a class" />
 </SelectTrigger>
 <SelectContent>
 {schedules.map((s) => (
 <SelectItem key={s.id} value={s.id}>
 {s.courseCode} · {s.dayOfWeek.slice(0, 3)} · {s.startTime}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </DocCard>

 <DocCard
 icon={UserCheck}
 title="Attendance Day Sheet"
 description="One class on one date — who was present, absent, late."
 downloading={busyKey === "attendance-day"}
 onDownload={() => void run("attendance-day", `type=attendance-day&scheduleId=${encodeURIComponent(dayScheduleId)}&date=${encodeURIComponent(dayDate)}`)}
 disabled={!dayScheduleId || !dayDate}
 >
 <div className="grid grid-cols-2 gap-2">
 <div className="space-y-1.5">
 <Label htmlFor="doc-day-class" className="text-xs">Class</Label>
 <Select value={dayScheduleId} onValueChange={(v) => onScopeChange({ dayScheduleId: v })}>
 <SelectTrigger id="doc-day-class" className="h-9">
 <SelectValue placeholder="Class" />
 </SelectTrigger>
 <SelectContent>
 {schedules.map((s) => (
 <SelectItem key={s.id} value={s.id}>
 {s.courseCode}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="doc-day-date" className="text-xs">Date</Label>
 <Input
 id="doc-day-date"
 type="date"
 value={dayDate}
 max={todayISO()}
 onChange={(e) => onScopeChange({ dayDate: e.target.value })}
 className="h-9"
 />
 </div>
 </div>
 </DocCard>

 <DocCard
 icon={GraduationCap}
 title="Results Sheet"
 description="All marks you entered for a course, every exam type."
 downloading={busyKey === "results"}
 onDownload={() => void run("results", `type=results&courseId=${encodeURIComponent(resultsCourseId)}`)}
 disabled={!resultsCourseId}
 >
 <div className="space-y-1.5">
 <Label htmlFor="doc-results-course" className="text-xs">Course</Label>
 <Select value={resultsCourseId} onValueChange={(v) => onScopeChange({ resultsCourseId: v })}>
 <SelectTrigger id="doc-results-course" className="h-9">
 <SelectValue placeholder="Pick a course" />
 </SelectTrigger>
 <SelectContent>
 {courses.map((c) => (
 <SelectItem key={c.id} value={c.id}>
 {c.code}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </DocCard>

 <DocCard
 icon={ClipboardList}
 title="Assignments List"
 description="Assignments you published — titles, due dates, max marks."
 downloading={busyKey === "assignments"}
 onDownload={() => void run("assignments", "type=assignments")}
 />

 <DocCard
 icon={History}
 title="Class Change History"
 description="Every cancellation, reschedule, room & time change you made."
 downloading={busyKey === "changes"}
 onDownload={() => void run("changes", "type=changes")}
 />

 <DocCard
 icon={Megaphone}
 title="My Notices"
 description="Notices you posted — titles, categories, full content."
 downloading={busyKey === "notices"}
 onDownload={() => void run("notices", "type=notices")}
 />
 </div>
 </SectionCard>
 </div>
 );
}
