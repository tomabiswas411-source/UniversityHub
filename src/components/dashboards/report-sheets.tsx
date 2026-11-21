"use client";

/**
 * Report Center (Phase 4, D46-48) — printable, tenant-branded sheets:
 *  - Dept admin: student transcript, batch result sheet, attendance summary
 *  - Super admin: university profile sheet
 *
 * Printing follows the Phase-2 transcript precedent: the sheet is rendered
 * into a print-only DOM root (hidden on screen, visible in @media print),
 * `document.title` is swapped so the browser's "Save as PDF" suggests a
 * sensible filename, then window.print() runs. No PDF library needed.
 */

import { useCallback, useState } from "react";
import {
 BarChart3,
 FileText,
 Loader2,
 Printer,
 Users,
 Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { SectionCard, GRADIENT_BTN, EmptyState } from "@/components/dashboards/dashboard-shared";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

/* ---------------- shared print plumbing ---------------- */

function printSheet(rootId: string, title: string) {
 const prev = document.title;
 try {
 document.title = title;
 window.print();
 } finally {
 // window.print() blocks in most browsers; restore regardless.
 document.title = prev;
 }
}

/** Branded sheet header shared by every report. */
function SheetHeader({
 branding,
 title,
 subtitle,
}: {
 branding: ReportBranding;
 title: string;
 subtitle?: string;
}) {
 return (
 <div className="border-b-2 border-black pb-3 text-center">
 <div className="flex items-center justify-center gap-3">
 {branding.logoURL ? (
 <img
 src={branding.logoURL}
 alt=""
 className="h-14 w-14 object-contain"
 onError={(e) => {
 e.currentTarget.style.display = "none";
 }}
 />
 ) : null}
 <div>
 <p className="text-lg font-bold uppercase tracking-wide">{branding.universityName}</p>
 <p className="text-sm">{branding.departmentName}</p>
 </div>
 </div>
 <p className="mt-2 text-base font-bold">{title}</p>
 {subtitle ? <p className="text-xs">{subtitle}</p> : null}
 </div>
 );
}

function SheetFooter({ note }: { note: string }) {
 return (
 <p className="mt-4 text-[10px] leading-snug">
 {note}
 </p>
 );
}

function SheetRoot({
 id,
 title,
 children,
}: {
 id: string;
 title: string;
 children: React.ReactNode;
}) {
 return (
 <div id={id} className="hidden print:block">
 <style
 dangerouslySetInnerHTML={{
 __html: `@media print { body * { visibility: hidden !important; } #${id}, #${id} * { visibility: visible !important; } #${id} { position: absolute; inset: 0; padding: 24px; color: #111; background: #fff; } }`,
 }}
 />
 <span className="sr-only">{title}</span>
 {children}
 </div>
 );
}

/* ---------------- payload types ---------------- */

export interface ReportBranding {
 universityName: string;
 universityShort: string | null;
 logoURL: string | null;
 address: string | null;
 departmentName: string;
}

export interface TranscriptReport {
 type: "transcript";
 branding: ReportBranding;
 student: {
 id: string;
 fullName: string;
 rollNumber: string | null;
 studentIdNumber: string | null;
 semester: number | null;
 section: string | null;
 programName: string | null;
 programShort: string | null;
 };
 rows: {
 courseId: string;
 courseCode: string;
 courseName: string;
 creditHours: number;
 examCount: number;
 avgPct: number;
 grade: string;
 gpaPoint: number;
 }[];
 totalCredits: number;
 gpa: number;
 totalEntries: number;
}

export interface BatchResultReport {
 type: "batch-results";
 branding: ReportBranding;
 course: {
 id: string;
 code: string;
 name: string;
 creditHours: number;
 semester: number | null;
 type: string;
 };
 rows: {
 studentId: string;
 fullName: string;
 rollNumber: string | null;
 studentIdNumber: string | null;
 semester: number | null;
 perExam: Record<string, string>;
 avgPct: number | null;
 grade: string | null;
 examCount: number;
 }[];
 stats: {
 students: number;
 marked: number;
 avgPct: number | null;
 passRate: number | null;
 };
}

export interface AttendanceSummaryReport {
 branding: ReportBranding;
 students: {
 studentId: string;
 fullName: string;
 rollNumber: string | null;
 studentIdNumber: string | null;
 programShort: string | null;
 semester: number | null;
 isActive: boolean;
 present: number;
 late: number;
 absent: number;
 excused: number;
 marked: number;
 rate: number | null;
 }[];
 summary: {
 totalStudents: number;
 totalMarked: number;
 deptRate: number | null;
 shortStudents: number;
 shortageLine: number;
 };
}

export interface UniversityProfile {
 university: {
 id: string;
 name: string;
 shortName: string | null;
 slug: string;
 address: string | null;
 contactEmail: string | null;
 contactPhone: string | null;
 websiteURL: string | null;
 planExpiresAt: string | null;
 isActive: boolean;
 createdAt: string;
 plan?: { name: string; maxDepartments: number; maxTeachers: number; maxStudents: number; priceMonthly: number } | null;
 departments: {
 id: string;
 name: string;
 code: string;
 isActive: boolean;
 _count: { users: number; schedules: number };
 }[];
 users?: { id: string; fullName: string; email: string; departmentId: string | null; isActive: boolean }[];
 };
}

/* ---------------- print sheets ---------------- */

function TranscriptPrintSheet({ report }: { report: TranscriptReport }) {
 return (
 <SheetRoot id="report-print" title="Transcript">
 <SheetHeader
 branding={report.branding}
 title="Unofficial Academic Transcript"
 subtitle="Issued by the department office via UniversityHub"
 />
 <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
 <p><b>Name:</b> {report.student.fullName}</p>
 <p><b>Roll:</b> {report.student.rollNumber ?? "—"}</p>
 <p><b>Student ID:</b> {report.student.studentIdNumber ?? "—"}</p>
 <p><b>Program:</b> {report.student.programName ?? "—"}</p>
 <p><b>Semester:</b> {report.student.semester ?? "—"}</p>
 <p><b>Section:</b> {report.student.section ?? "—"}</p>
 </div>
 <table className="mt-4 w-full border-collapse text-sm">
 <thead>
 <tr className="border-b-2 border-black text-left">
 <th className="py-1 pr-2">Course</th>
 <th className="py-1 pr-2">Title</th>
 <th className="py-1 pr-2">Credits</th>
 <th className="py-1 pr-2">Exams</th>
 <th className="py-1 pr-2">Average</th>
 <th className="py-1 pr-2">Grade</th>
 <th className="py-1">GP</th>
 </tr>
 </thead>
 <tbody>
 {report.rows.map((r) => (
 <tr key={r.courseId} className="border-b border-neutral-300">
 <td className="py-1 pr-2 font-semibold">{r.courseCode}</td>
 <td className="py-1 pr-2">{r.courseName}</td>
 <td className="py-1 pr-2">{r.creditHours}</td>
 <td className="py-1 pr-2">{r.examCount}</td>
 <td className="py-1 pr-2">{r.avgPct}%</td>
 <td className="py-1 pr-2 font-bold">{r.grade}</td>
 <td className="py-1">{r.gpaPoint.toFixed(2)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 <div className="mt-4 flex flex-wrap justify-between gap-4 text-sm font-bold">
 <p>Credits attempted: {report.totalCredits}</p>
 <p>GPA: {report.gpa.toFixed(2)} / 4.00</p>
 </div>
 <SheetFooter
 note={`Generated from ${report.totalEntries} entered exam result${report.totalEntries === 1 ? "" : "s"} on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}. GPA follows the Bangladesh UGC 4.00 scale (A+ ≥ 80% … D ≥ 40%). This is an UNOFFICIAL transcript.`}
 />
 </SheetRoot>
 );
}

function BatchResultPrintSheet({ report }: { report: BatchResultReport }) {
 return (
 <SheetRoot id="report-print" title={`Result Sheet ${report.course.code}`}>
 <SheetHeader
 branding={report.branding}
 title={`Batch Result Sheet — ${report.course.code}`}
 subtitle={`${report.course.name}${report.course.semester ? ` · Semester ${report.course.semester}` : ""} · ${report.course.creditHours} credits`}
 />
 <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
 <p><b>Students:</b> {report.stats.students}</p>
 <p><b>Marked:</b> {report.stats.marked}</p>
 <p><b>Batch Average:</b> {report.stats.avgPct === null ? "—" : `${report.stats.avgPct}%`}</p>
 <p><b>Pass Rate:</b> {report.stats.passRate === null ? "—" : `${report.stats.passRate}%`}</p>
 </div>
 <table className="mt-3 w-full border-collapse text-sm">
 <thead>
 <tr className="border-b-2 border-black text-left">
 <th className="py-1 pr-2">Roll</th>
 <th className="py-1 pr-2">Student</th>
 <th className="py-1 pr-2">CT-1</th>
 <th className="py-1 pr-2">CT-2</th>
 <th className="py-1 pr-2">Mid</th>
 <th className="py-1 pr-2">Final</th>
 <th className="py-1 pr-2">Asn</th>
 <th className="py-1 pr-2">Avg</th>
 <th className="py-1">Grade</th>
 </tr>
 </thead>
 <tbody>
 {report.rows.map((r) => (
 <tr key={r.studentId} className="border-b border-neutral-300">
 <td className="py-1 pr-2">{r.rollNumber ?? "—"}</td>
 <td className="py-1 pr-2">{r.fullName}</td>
 <td className="py-1 pr-2">{r.perExam.ct1}</td>
 <td className="py-1 pr-2">{r.perExam.ct2}</td>
 <td className="py-1 pr-2">{r.perExam.midterm}</td>
 <td className="py-1 pr-2">{r.perExam.final}</td>
 <td className="py-1 pr-2">{r.perExam.assignment}</td>
 <td className="py-1 pr-2">{r.avgPct === null ? "—" : `${r.avgPct}%`}</td>
 <td className="py-1 font-bold">{r.grade ?? "—"}</td>
 </tr>
 ))}
 </tbody>
 </table>
 <SheetFooter
 note={`Average = mean of all entered exam percentages for the course; pass = 40% or above (D). Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} via UniversityHub.`}
 />
 </SheetRoot>
 );
}

function AttendanceSummaryPrintSheet({
 report,
 scopeLabel,
}: {
 report: AttendanceSummaryReport;
 scopeLabel: string;
}) {
 return (
 <SheetRoot id="report-print" title="Attendance Summary">
 <SheetHeader
 branding={report.branding}
 title="Attendance Summary Sheet"
 subtitle={scopeLabel}
 />
 <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
 <p><b>Students:</b> {report.summary.totalStudents}</p>
 <p><b>Marks filed:</b> {report.summary.totalMarked}</p>
 <p><b>Department rate:</b> {report.summary.deptRate === null ? "—" : `${report.summary.deptRate}%`}</p>
 <p><b>Below {report.summary.shortageLine}%:</b> {report.summary.shortStudents}</p>
 </div>
 <table className="mt-3 w-full border-collapse text-sm">
 <thead>
 <tr className="border-b-2 border-black text-left">
 <th className="py-1 pr-2">Roll</th>
 <th className="py-1 pr-2">Student</th>
 <th className="py-1 pr-2">Program</th>
 <th className="py-1 pr-2">Sem</th>
 <th className="py-1 pr-2">Marked</th>
 <th className="py-1 pr-2">P</th>
 <th className="py-1 pr-2">L</th>
 <th className="py-1 pr-2">A</th>
 <th className="py-1">Rate</th>
 </tr>
 </thead>
 <tbody>
 {report.students.map((r) => (
 <tr key={r.studentId} className="border-b border-neutral-300">
 <td className="py-1 pr-2">{r.rollNumber ?? "—"}</td>
 <td className="py-1 pr-2">{r.fullName}</td>
 <td className="py-1 pr-2">{r.programShort ?? "—"}</td>
 <td className="py-1 pr-2">{r.semester ?? "—"}</td>
 <td className="py-1 pr-2">{r.marked}</td>
 <td className="py-1 pr-2">{r.present}</td>
 <td className="py-1 pr-2">{r.late}</td>
 <td className="py-1 pr-2">{r.absent}</td>
 <td className="py-1 font-bold">
 {r.rate === null ? "—" : `${r.rate}%${r.rate < report.summary.shortageLine ? " ⚠" : ""}`}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 <SheetFooter
 note={`Rate = (present + late) / marked; excused entries are excluded. Students below the ${report.summary.shortageLine}% exam-permission line are flagged (⚠). Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} via UniversityHub.`}
 />
 </SheetRoot>
 );
}

function UniversityProfilePrintSheet({ report }: { report: UniversityProfile }) {
 const u = report.university;
 const teachers = u.departments.reduce((a, d) => a + d._count.users, 0);
 const schedules = u.departments.reduce((a, d) => a + d._count.schedules, 0);
 const fmtDate = (iso: string | null) =>
 iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
 return (
 <SheetRoot id="report-print" title={`Profile ${u.shortName || u.name}`}>
 <SheetHeader
 branding={{
 universityName: u.name,
 universityShort: u.shortName,
 logoURL: null,
 address: u.address,
 departmentName: "Platform Profile — UniversityHub",
 }}
 title="University Profile Sheet"
 subtitle={u.isActive ? "Active tenant" : "Inactive tenant"}
 />
 <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
 <p><b>Short name:</b> {u.shortName ?? "—"}</p>
 <p><b>Slug:</b> {u.slug}</p>
 <p><b>Plan:</b> {u.plan?.name ?? "—"}</p>
 <p><b>Monthly price:</b> {u.plan ? `৳${u.plan.priceMonthly}` : "—"}</p>
 <p><b>Plan expires:</b> {fmtDate(u.planExpiresAt)}</p>
 <p><b>Member since:</b> {fmtDate(u.createdAt)}</p>
 <p><b>Contact:</b> {u.contactEmail ?? "—"}</p>
 <p><b>Phone:</b> {u.contactPhone ?? "—"}</p>
 <p><b>Website:</b> {u.websiteURL ?? "—"}</p>
 <p><b>Address:</b> {u.address ?? "—"}</p>
 </div>
 <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm font-bold">
 <p>Departments: {u.departments.length}</p>
 <p>Teachers: {teachers}</p>
 <p>Schedules: {schedules}</p>
 <p>Caps: D {u.plan?.maxDepartments ?? "—"} / T {u.plan?.maxTeachers ?? "—"} / S {u.plan?.maxStudents ?? "—"}</p>
 </div>
 <table className="mt-3 w-full border-collapse text-sm">
 <thead>
 <tr className="border-b-2 border-black text-left">
 <th className="py-1 pr-2">Department</th>
 <th className="py-1 pr-2">Code</th>
 <th className="py-1 pr-2">Teachers</th>
 <th className="py-1 pr-2">Schedules</th>
 <th className="py-1">Status</th>
 </tr>
 </thead>
 <tbody>
 {u.departments.map((d) => (
 <tr key={d.id} className="border-b border-neutral-300">
 <td className="py-1 pr-2">{d.name}</td>
 <td className="py-1 pr-2">{d.code}</td>
 <td className="py-1 pr-2">{d._count.users}</td>
 <td className="py-1 pr-2">{d._count.schedules}</td>
 <td className="py-1">{d.isActive ? "Active" : "Inactive"}</td>
 </tr>
 ))}
 </tbody>
 </table>
 <SheetFooter
 note={`Snapshot generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} from the UniversityHub platform database.`}
 />
 </SheetRoot>
 );
}

/* ============================================================
 Dept Report Center — 3 reports, pickers + on-demand fetch
 ============================================================ */

interface DeptReportCenterProps {
 departmentId: string;
 students: { id: string; fullName: string; rollNumber: string | null }[];
 courses: { id: string; code: string; name: string }[];
 programs: { id: string; shortName: string; name: string }[];
}

type DeptSheet =
 | { kind: "transcript"; report: TranscriptReport }
 | { kind: "batch"; report: BatchResultReport }
 | { kind: "attendance"; report: AttendanceSummaryReport; scopeLabel: string };

export function DeptReportCenter({ departmentId, students, courses, programs }: DeptReportCenterProps) {
 const [studentId, setStudentId] = useState("none");
 const [courseId, setCourseId] = useState("none");
 const [attProgram, setAttProgram] = useState("all");
 const [attSemester, setAttSemester] = useState("all");
 const [busy, setBusy] = useState<null | "transcript" | "batch" | "attendance">(null);
 const [sheet, setSheet] = useState<DeptSheet | null>(null);

 /** Mount the sheet, let it paint, print, then unmount. Kept in the
 click handler (not an effect) so React StrictMode can't double-fire. */
 const printAfterPaint = useCallback((s: DeptSheet) => {
 setSheet(s);
 setTimeout(() => {
 printSheet("report-print", "UniversityHub Report");
 setSheet(null);
 }, 250);
 }, []);

 const genTranscript = useCallback(async () => {
 if (studentId === "none") {
 toast({ title: "Pick a student first", description: "Choose the student whose transcript you want to print." });
 return;
 }
 setBusy("transcript");
 try {
 const v = await apiGet<TranscriptReport>(
 `/api/manage/report-data?departmentId=${departmentId}&type=transcript&studentId=${studentId}`
 );
 if (v.rows.length === 0) {
 toast({ title: "No results yet", description: "This student has no entered marks, so the transcript would be empty." });
 return;
 }
 printAfterPaint({ kind: "transcript", report: v });
 } catch (err) {
 toast({ title: "Could not build the transcript", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
 } finally {
 setBusy(null);
 }
 }, [departmentId, studentId, printAfterPaint]);

 const genBatch = useCallback(async () => {
 if (courseId === "none") {
 toast({ title: "Pick a course first", description: "Choose the course whose result sheet you want to print." });
 return;
 }
 setBusy("batch");
 try {
 const v = await apiGet<BatchResultReport>(
 `/api/manage/report-data?departmentId=${departmentId}&type=batch-results&courseId=${courseId}`
 );
 if (v.rows.length === 0) {
 toast({ title: "No results yet", description: "This course has no entered marks, so the result sheet would be empty." });
 return;
 }
 printAfterPaint({ kind: "batch", report: v });
 } catch (err) {
 toast({ title: "Could not build the result sheet", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
 } finally {
 setBusy(null);
 }
 }, [departmentId, courseId, printAfterPaint]);

 const genAttendance = useCallback(async () => {
 setBusy("attendance");
 try {
 const params = new URLSearchParams({ departmentId });
 if (attProgram !== "all") params.set("programId", attProgram);
 if (attSemester !== "all") params.set("semester", attSemester);
 const v = await apiGet<AttendanceSummaryReport>(`/api/manage/attendance-report?${params}`);
 if (v.students.length === 0) {
 toast({ title: "No students match", description: "Adjust the program / semester scope." });
 return;
 }
 const pLabel = attProgram === "all" ? "All programs" : (programs.find((p) => p.id === attProgram)?.shortName ?? "Program");
 const sLabel = attSemester === "all" ? "All semesters" : `Semester ${attSemester}`;
 printAfterPaint({ kind: "attendance", report: v, scopeLabel: `${pLabel} · ${sLabel}` });
 } catch (err) {
 toast({ title: "Could not build the attendance summary", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
 } finally {
 setBusy(null);
 }
 }, [departmentId, attProgram, attSemester, programs, printAfterPaint]);

 return (
 <>
 <SectionCard title="Student Transcript" icon={FileText}>
 <p className="mb-3 text-sm text-muted-foreground">
 A credit-weighted GPA transcript for one student, branded with the university header.
 </p>
 <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
 <div className="min-w-0 flex-1">
 <Select value={studentId} onValueChange={setStudentId}>
 <SelectTrigger aria-label="Select student for transcript"><SelectValue placeholder="Select student" /></SelectTrigger>
 <SelectContent className="max-h-72">
 <SelectItem value="none">Select student…</SelectItem>
 {students.map((s) => (
 <SelectItem key={s.id} value={s.id}>
 {s.fullName}{s.rollNumber ? ` (${s.rollNumber})` : ""}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <Button className={cn("h-10 gap-1.5", GRADIENT_BTN)} onClick={() => void genTranscript()} disabled={busy !== null}>
 {busy === "transcript" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
 Print Transcript
 </Button>
 </div>
 </SectionCard>

 <SectionCard title="Batch Result Sheet" icon={BarChart3}>
 <p className="mb-3 text-sm text-muted-foreground">
 Every student&apos;s per-exam marks, average and grade for one course — ready for the exam committee.
 </p>
 <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
 <div className="min-w-0 flex-1">
 <Select value={courseId} onValueChange={setCourseId}>
 <SelectTrigger aria-label="Select course for result sheet"><SelectValue placeholder="Select course" /></SelectTrigger>
 <SelectContent className="max-h-72">
 <SelectItem value="none">Select course…</SelectItem>
 {courses.map((c) => (
 <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <Button className={cn("h-10 gap-1.5", GRADIENT_BTN)} onClick={() => void genBatch()} disabled={busy !== null}>
 {busy === "batch" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
 Print Result Sheet
 </Button>
 </div>
 </SectionCard>

 <SectionCard title="Attendance Summary" icon={Users}>
 <p className="mb-3 text-sm text-muted-foreground">
 Per-student attendance register with the 75% exam-permission line flagged — scope it by program and semester.
 </p>
 <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
 <Select value={attProgram} onValueChange={setAttProgram}>
 <SelectTrigger aria-label="Attendance summary program scope"><SelectValue placeholder="All programs" /></SelectTrigger>
 <SelectContent>
 <SelectItem value="all">All programs</SelectItem>
 {programs.map((p) => (
 <SelectItem key={p.id} value={p.id}>{p.shortName || p.name}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Select value={attSemester} onValueChange={setAttSemester}>
 <SelectTrigger aria-label="Attendance summary semester scope"><SelectValue placeholder="All semesters" /></SelectTrigger>
 <SelectContent>
 <SelectItem value="all">All semesters</SelectItem>
 {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
 <SelectItem key={n} value={String(n)}>Semester {n}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Button className={cn("h-10 gap-1.5", GRADIENT_BTN)} onClick={() => void genAttendance()} disabled={busy !== null}>
 {busy === "attendance" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
 Print Summary
 </Button>
 </div>
 </SectionCard>

 {students.length === 0 && courses.length === 0 ? (
 <EmptyState
 icon={Printer}
 title="Nothing to report yet"
 hint="Reports light up once students, courses and marks exist."
 />
 ) : null}

 {/* print target — mounted only while a sheet is ready */}
 {sheet?.kind === "transcript" && <TranscriptPrintSheet report={sheet.report} />}
 {sheet?.kind === "batch" && <BatchResultPrintSheet report={sheet.report} />}
 {sheet?.kind === "attendance" && (
 <AttendanceSummaryPrintSheet report={sheet.report} scopeLabel={sheet.scopeLabel} />
 )}
 </>
 );
}

/* ============================================================
 Super-admin Report Center — university profile sheet
 ============================================================ */

interface SuperReportCenterProps {
 universities: { id: string; name: string; shortName: string | null; isActive: boolean }[];
}

export function SuperReportCenter({ universities }: SuperReportCenterProps) {
 const [uniId, setUniId] = useState("none");
 const [busy, setBusy] = useState(false);
 const [report, setReport] = useState<UniversityProfile | null>(null);

 const generate = useCallback(async () => {
 if (uniId === "none") {
 toast({ title: "Pick a university first", description: "Choose which tenant to profile." });
 return;
 }
 setBusy(true);
 try {
 const v = await apiGet<UniversityProfile>(`/api/admin/university?id=${uniId}`);
 setReport(v);
 setTimeout(() => {
 printSheet("report-print", "University Profile");
 setReport(null);
 }, 250);
 } catch (err) {
 toast({ title: "Could not build the profile", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
 } finally {
 setBusy(false);
 }
 }, [uniId]);

 return (
 <>
 <SectionCard title="University Profile Sheet" icon={Building2}>
 <p className="mb-3 text-sm text-muted-foreground">
 A branded one-pager per tenant: plan, caps, expiry, contact info and a per-department usage table — ideal for renewal meetings.
 </p>
 {universities.length === 0 ? (
 <EmptyState icon={Building2} title="No universities yet" hint="Create a tenant first." />
 ) : (
 <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
 <div className="min-w-0 flex-1">
 <Select value={uniId} onValueChange={setUniId}>
 <SelectTrigger aria-label="Select university for profile sheet"><SelectValue placeholder="Select university" /></SelectTrigger>
 <SelectContent className="max-h-72">
 <SelectItem value="none">Select university…</SelectItem>
 {universities.map((u) => (
 <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <Button className={cn("h-10 gap-1.5", GRADIENT_BTN)} onClick={() => void generate()} disabled={busy}>
 {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
 Print Profile
 </Button>
 </div>
 )}
 </SectionCard>

 {report && <UniversityProfilePrintSheet report={report} />}
 </>
 );
}
