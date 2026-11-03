"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
 AlertTriangle,
 BarChart3,
 BookOpen,
 Building2,
 CalendarClock,
 CalendarDays,
 CheckCheck,
 ClipboardCheck,
 ClipboardList,
 Clock,
 GraduationCap,
 History,
 Loader2,
 MapPin,
 Megaphone,
 Pencil,
 Pin,
 Plus,
 Save,
 Send,
 Trash2,
 TrendingUp,
 UserCheck,
 Users,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { timeAgo } from "@/components/shared/notification-bell";
import {
 ChangeTypeBadge,
 CategoryBadge,
 EmptyState,
 ExamTypeBadge,
 GRADIENT_BTN,
 PanelLoader,
 SectionCard,
 StatCard,
 TimetableGrid,
} from "@/components/dashboards/dashboard-shared";
import {
 CHART_COLORS,
 ChartCard,
 HBarChart,
 StatPill,
 VBarChart,
} from "@/components/dashboards/analytics-charts";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type {
 AssignmentDTO,
 CourseDTO,
 NoticeDTO,
 ResultDTO,
 ScheduleChangeDTO,
 ScheduleDTO,
 TimeSlotDTO,
} from "@/types";
import { DAYS_OF_WEEK, DAY_LABELS } from "@/types";

/* ============================================================
 TeacherPanel — "Aurora Royale" teacher cockpit
 Tabs: My Schedule · Attendance · Class Changes · Assignments ·
 Results · Notices · Insights
============================================================ */

type ResultRow = ResultDTO & {
 student: { fullName: string; rollNumber: string | null; studentIdNumber: string };
};
type StudentRow = { id: string; fullName: string; rollNumber: string | null; studentIdNumber: string };
type AssignmentRow = AssignmentDTO & { course?: { code: string; name: string } };
type ChangeFormType = "cancelled" | "rescheduled" | "extra_class";

const EXAM_LABELS: Record<string, string> = { ct1: "CT-1", ct2: "CT-2", midterm: "Midterm", final: "Final" };

/* Attendance status options — compact segmented control */
const ATT_OPTIONS = [
 { value: "present", label: "Present", active: "bg-emerald-600 text-white", idle: "text-emerald-700 dark:text-emerald-300" },
 { value: "absent", label: "Absent", active: "bg-rose-600 text-white", idle: "text-rose-700 dark:text-rose-300" },
 { value: "late", label: "Late", active: "bg-amber-500 text-white", idle: "text-amber-700 dark:text-amber-300" },
 { value: "excused", label: "Excused", active: "bg-slate-600 text-white", idle: "text-slate-600 dark:text-slate-300" },
] as const;

/* Subtle framer-motion entrance: fade + 12px slide, staggered */
function FadeIn({ index = 0, className, children }: { index?: number; className?: string; children: ReactNode }) {
 return (
 <motion.div
 initial={{ opacity: 0, y: 12 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: Math.min(index * 0.05, 0.5), duration: 0.3 }}
 className={className}
 >
 {children}
 </motion.div>
 );
}

/* Styled long-list scroller */
const SCROLL =
 "max-h-96 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#2D4F35]/30 dark:[&::-webkit-scrollbar-thumb]:bg-[#4A7C58]/40";

function errMsg(err: unknown): string {
 return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

function todayISO(): string {
 const now = new Date();
 return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function fmtDate(value: string): string {
 const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
 if (Number.isNaN(d.getTime())) return value;
 return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function dayLabel(day: string | null): string | null {
 if (!day) return null;
 return (DAY_LABELS as Record<string, string>)[day] ?? day;
}

function dueChip(due: string | null): { text: string; cls: string } {
 if (!due) return { text: "No due date", cls: "bg-muted text-muted-foreground" };
 const d = new Date(`${due}T23:59:59`);
 if (Number.isNaN(d.getTime())) return { text: due, cls: "bg-muted text-muted-foreground" };
 const diffDays = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
 if (diffDays < 0)
 return { text: `Overdue · ${fmtDate(due)}`, cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" };
 if (diffDays <= 3)
 return {
 text: diffDays === 0 ? `Due today · ${fmtDate(due)}` : `Due in ${diffDays}d · ${fmtDate(due)}`,
 cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
 };
 return { text: fmtDate(due), cls: "bg-muted text-muted-foreground" };
}

function parseMarks(raw: string): number | null {
 const t = raw.trim();
 if (t === "") return null;
 const n = Number(t);
 return Number.isNaN(n) ? null : n;
}

function computeGrade(m: number): string {
 if (m >= 16) return "A+";
 if (m >= 14) return "A";
 if (m >= 12) return "A-";
 if (m >= 10) return "B";
 if (m >= 8) return "C";
 if (m >= 6) return "D";
 return "F";
}

function gradeCls(m: number): string {
 if (m >= 14) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
 if (m >= 10) return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
 return "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300";
}

export function TeacherPanel() {
 const user = useAuthStore((s) => s.user);
 const mounted = useMountedFlag();

 /* ---------------- overview data ---------------- */
 const [loading, setLoading] = useState(true);
 const [schedules, setSchedules] = useState<ScheduleDTO[]>([]);
 const [courses, setCourses] = useState<CourseDTO[]>([]);
 const [changes, setChanges] = useState<ScheduleChangeDTO[]>([]);
 const [stats, setStats] = useState({ totalClasses: 0, todayClasses: 0, totalCourses: 0 });
 const [activeTab, setActiveTab] = useState("schedule");

 /* ---------------- insights (Day 42, lazy-loaded) ---------------- */
 interface TeacherInsights {
 hasData: boolean;
 totalEntries: number;
 courseCount: number;
 assignmentCount: number;
 weeklyLoad: { label: string; value: number }[];
 courseStats: {
 courseId: string;
 courseCode: string;
 courseName: string;
 creditHours: number;
 totalEntries: number;
 avgPct: number;
 grade: string;
 gpaPoint: number;
 examBreakdown: { examType: string; count: number; avgPct: number }[];
 topStudents: { name: string; roll: string | null; avgPct: number }[];
 atRiskStudents: { name: string; roll: string | null; avgPct: number }[];
 }[];
 upcomingAssignments: { id: string; title: string; dueDate: string | null }[];
 }
 const [insights, setInsights] = useState<TeacherInsights | null>(null);
 const [insightsLoading, setInsightsLoading] = useState(false);
 const loadInsights = useCallback(async () => {
 setInsightsLoading(true);
 try {
 const data = await apiGet<TeacherInsights>("/api/teacher/insights");
 setInsights(data);
 } catch (err) {
 toast({ title: "Failed to load insights", description: errMsg(err), variant: "destructive" });
 } finally {
 setInsightsLoading(false);
 }
 }, []);

 /* ---------------- attendance (role capability loop) ---------------- */
 interface AttScheduleInfo {
 id: string;
 courseCode: string;
 courseName: string;
 startTime: string;
 endTime: string;
 dayOfWeek: string;
 }
 const [attScheduleId, setAttScheduleId] = useState("");
 const [attDate, setAttDate] = useState(todayISO());
 const [attSchedule, setAttSchedule] = useState<AttScheduleInfo | null>(null);
 const [attStudents, setAttStudents] = useState<StudentRow[]>([]);
 const [attStatuses, setAttStatuses] = useState<Record<string, string>>({});
 const [attRecentDates, setAttRecentDates] = useState<string[]>([]);
 const [attLoading, setAttLoading] = useState(false);
 const [attSaving, setAttSaving] = useState(false);

 const loadAttendance = useCallback(async (scheduleId: string, date: string) => {
 if (!scheduleId) {
 setAttStudents([]);
 setAttStatuses({});
 setAttSchedule(null);
 setAttRecentDates([]);
 return;
 }
 setAttLoading(true);
 try {
 const data = await apiGet<{
 schedule: AttScheduleInfo;
 students: StudentRow[];
 existing: Record<string, string>;
 markedCount: number;
 recentDates: string[];
 }>(`/api/teacher/attendance?scheduleId=${encodeURIComponent(scheduleId)}&date=${encodeURIComponent(date)}`);
 setAttSchedule(data.schedule);
 setAttStudents(data.students);
 setAttStatuses({ ...data.existing });
 setAttRecentDates(data.recentDates ?? []);
 } catch (err) {
 toast({ title: "Failed to load roster", description: errMsg(err), variant: "destructive" });
 } finally {
 setAttLoading(false);
 }
 }, []);

 useEffect(() => {
 void loadAttendance(attScheduleId, attDate);
 }, [attScheduleId, attDate, loadAttendance]);

 const attSummary = useMemo(() => {
 const counts = { present: 0, absent: 0, late: 0, excused: 0 };
 let unmarked = 0;
 for (const st of attStudents) {
 const s = attStatuses[st.id];
 if (!s) unmarked++;
 else if (s in counts) counts[s as keyof typeof counts]++;
 }
 return { ...counts, unmarked };
 }, [attStudents, attStatuses]);

 function setAllStatus(status: string) {
 const next: Record<string, string> = {};
 for (const st of attStudents) next[st.id] = status;
 setAttStatuses(next);
 }

 async function saveAttendance() {
 if (!attScheduleId) return;
 const entries = attStudents
 .map((st) => ({ studentId: st.id, status: attStatuses[st.id] ?? "" }))
 .filter((e) => e.status !== "");
 if (entries.length === 0) {
 toast({
 title: "Nothing to save",
 description: "Mark at least one student present, absent, late or excused.",
 variant: "destructive",
 });
 return;
 }
 setAttSaving(true);
 try {
 const data = await apiPost<{ saved: number; absentNotified: number }>("/api/teacher/attendance", {
 scheduleId: attScheduleId,
 date: attDate,
 entries,
 });
 toast({
 title: "Attendance saved",
 description: `${data.saved ?? entries.length} students marked${data.absentNotified ? ` · ${data.absentNotified} absent alert${data.absentNotified === 1 ? "" : "s"} sent` : ""}.`,
 });
 void loadAttendance(attScheduleId, attDate);
 } catch (err) {
 toast({ title: "Failed to save attendance", description: errMsg(err), variant: "destructive" });
 } finally {
 setAttSaving(false);
 }
 }

 /* ---------------- my notices (teacher publishes) ---------------- */
 const [myNotices, setMyNotices] = useState<NoticeDTO[] | null>(null);
 const [myNoticesLoading, setMyNoticesLoading] = useState(false);
 const [noticeOpen, setNoticeOpen] = useState(false);
 const [nTitle, setNTitle] = useState("");
 const [nContent, setNContent] = useState("");
 const [nCategory, setNCategory] = useState("general");
 const [nAudience, setNAudience] = useState("all");
 const [nCourseId, setNCourseId] = useState("none");
 const [nPinned, setNPinned] = useState(false);
 const [nSubmitting, setNSubmitting] = useState(false);
 const [noticeDeleteId, setNoticeDeleteId] = useState<string | null>(null);
 const [noticeDeleting, setNoticeDeleting] = useState(false);

 const loadMyNotices = useCallback(async () => {
 setMyNoticesLoading(true);
 try {
 const data = await apiGet<{ notices: NoticeDTO[] }>("/api/teacher/notices");
 setMyNotices(data.notices);
 } catch (err) {
 toast({ title: "Failed to load your notices", description: errMsg(err), variant: "destructive" });
 } finally {
 setMyNoticesLoading(false);
 }
 }, []);

 async function submitNotice(e: FormEvent<HTMLFormElement>) {
 e.preventDefault();
 if (!nTitle.trim() || !nContent.trim()) {
 toast({ title: "Missing information", description: "Title and content are required.", variant: "destructive" });
 return;
 }
 setNSubmitting(true);
 try {
 const body: Record<string, unknown> = {
 title: nTitle.trim(),
 content: nContent.trim(),
 category: nCategory,
 audience: nAudience,
 isPinned: nPinned,
 };
 if (nCourseId !== "none") body.courseId = nCourseId;
 const data = await apiPost<{ notified: number }>("/api/teacher/notices", body);
 toast({ title: "Notice published", description: `Notified ${data.notified ?? 0} people.` });
 setNTitle("");
 setNContent("");
 setNCategory("general");
 setNAudience("all");
 setNCourseId("none");
 setNPinned(false);
 setMyNotices(null); // force reload on next visit
 void loadMyNotices();
 } catch (err) {
 toast({ title: "Couldn't publish notice", description: errMsg(err), variant: "destructive" });
 } finally {
 setNSubmitting(false);
 }
 }

 async function confirmNoticeDelete() {
 if (!noticeDeleteId) return;
 setNoticeDeleting(true);
 try {
 await apiDelete<{ deleted: boolean }>(`/api/teacher/notices?id=${encodeURIComponent(noticeDeleteId)}`);
 setMyNotices((prev) => prev?.filter((n) => n.id !== noticeDeleteId) ?? null);
 toast({ title: "Notice deleted", description: "The notice has been removed." });
 setNoticeDeleteId(null);
 } catch (err) {
 toast({ title: "Failed to delete notice", description: errMsg(err), variant: "destructive" });
 } finally {
 setNoticeDeleting(false);
 }
 }

 const handleTabChange = useCallback(
 (v: string) => {
 setActiveTab(v);
 if (v === "insights" && !insights && !insightsLoading) void loadInsights();
 if (v === "notices" && myNotices === null && !myNoticesLoading) void loadMyNotices();
 },
 [insights, insightsLoading, loadInsights, myNotices, myNoticesLoading, loadMyNotices]
 );

 const loadOverview = useCallback(async () => {
 setLoading(true);
 try {
 const data = await apiGet<{
 schedules: ScheduleDTO[];
 courses: CourseDTO[];
 changes: ScheduleChangeDTO[];
 stats: { totalClasses: number; todayClasses: number; totalCourses: number };
 }>("/api/teacher/overview");
 setSchedules(data.schedules);
 setCourses(data.courses);
 setChanges(data.changes);
 setStats(data.stats ?? { totalClasses: data.schedules.length, todayClasses: 0, totalCourses: data.courses.length });
 } catch (err) {
 toast({ title: "Failed to load dashboard", description: errMsg(err), variant: "destructive" });
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 void loadOverview();
 }, [loadOverview]);

 /* ---------------- derived: synthetic timetable ----------------
 Overview schedules carry startTime/endTime but no resolvable
 timeSlotId, so we build synthetic slots (id = startTime) and
 remap each schedule's timeSlotId onto its startTime so the
 shared TimetableGrid rows line up. */
 const syntheticSlots = useMemo<TimeSlotDTO[]>(() => {
 const seen = new Map<string, TimeSlotDTO>();
 for (const s of schedules) {
 if (!seen.has(s.startTime)) {
 seen.set(s.startTime, {
 id: s.startTime,
 departmentId: "",
 label: s.startTime,
 startTime: s.startTime,
 endTime: s.endTime,
 slotOrder: 0,
 isBreak: false,
 isActive: true,
 });
 }
 }
 return Array.from(seen.values())
 .sort((a, b) => a.startTime.localeCompare(b.startTime))
 .map((slot, i) => ({ ...slot, slotOrder: i }));
 }, [schedules]);

 const gridSchedules = useMemo(
 () => schedules.map((s) => ({ ...s, timeSlotId: s.startTime })),
 [schedules]
 );

 const today = new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
 const todayStr = todayISO();
 const todays = useMemo(
 () =>
 schedules
 .filter((s) => s.dayOfWeek === today)
 .sort((a, b) => a.startTime.localeCompare(b.startTime)),
 [schedules, today]
 );

 const greeting = (() => {
 const h = new Date().getHours();
 if (h < 12) return "Good morning";
 if (h < 17) return "Good afternoon";
 return "Good evening";
 })();

 /* ---------------- class change form ---------------- */
 const [ccScheduleId, setCcScheduleId] = useState("");
 const [ccType, setCcType] = useState<ChangeFormType>("cancelled");
 const [ccDay, setCcDay] = useState("");
 const [ccDate, setCcDate] = useState(() => todayISO());
 const [ccReason, setCcReason] = useState("");
 const [ccSubmitting, setCcSubmitting] = useState(false);

 async function submitChange(e: FormEvent<HTMLFormElement>) {
 e.preventDefault();
 if (!ccScheduleId) {
 toast({ title: "Pick a class", description: "Select which class you want to change.", variant: "destructive" });
 return;
 }
 if (ccType !== "cancelled" && !ccDay) {
 toast({ title: "Pick a day", description: "Choose the day for this class change.", variant: "destructive" });
 return;
 }
 if (!ccReason.trim()) {
 toast({ title: "Reason required", description: "Students will see why the class changed.", variant: "destructive" });
 return;
 }
 setCcSubmitting(true);
 try {
 const body: Record<string, unknown> = {
 scheduleId: ccScheduleId,
 changeType: ccType,
 reason: ccReason.trim(),
 };
 if (ccDate) body.effectiveDate = ccDate;
 if (ccType !== "cancelled") body.newDay = ccDay;
 const data = await apiPost<{ change: ScheduleChangeDTO; notified: number }>("/api/teacher/class-change", body);
 setChanges((prev) => [data.change, ...prev]);
 toast({ title: "Change announced", description: `Notified ${data.notified ?? 0} students.` });
 setCcType("cancelled");
 setCcDay("");
 setCcReason("");
 } catch (err) {
 toast({ title: "Couldn't submit change", description: errMsg(err), variant: "destructive" });
 } finally {
 setCcSubmitting(false);
 }
 }

 /* ---------------- assignments ---------------- */
 const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
 const [assignmentsLoading, setAssignmentsLoading] = useState(false);
 const [assignmentFilter, setAssignmentFilter] = useState("all");
 const [dialogOpen, setDialogOpen] = useState(false);
 const [editingId, setEditingId] = useState<string | null>(null);
 const [aCourseId, setACourseId] = useState("");
 const [aTitle, setATitle] = useState("");
 const [aDesc, setADesc] = useState("");
 const [aDue, setADue] = useState("");
 const [aMax, setAMax] = useState("");
 const [aSubmitting, setASubmitting] = useState(false);
 const [deleteId, setDeleteId] = useState<string | null>(null);
 const [deleting, setDeleting] = useState(false);

 const loadAssignments = useCallback(async () => {
 setAssignmentsLoading(true);
 try {
 const qs = assignmentFilter !== "all" ? `?courseId=${encodeURIComponent(assignmentFilter)}` : "";
 const data = await apiGet<{ assignments: AssignmentRow[] }>(`/api/teacher/assignments${qs}`);
 setAssignments(data.assignments);
 } catch (err) {
 toast({ title: "Failed to load assignments", description: errMsg(err), variant: "destructive" });
 } finally {
 setAssignmentsLoading(false);
 }
 }, [assignmentFilter]);

 useEffect(() => {
 if (activeTab !== "assignments") return;
 void loadAssignments();
 }, [activeTab, assignmentFilter, loadAssignments]);

 function openAssignmentDialog(a?: AssignmentRow) {
 if (a) {
 setEditingId(a.id);
 setACourseId(a.courseId);
 setATitle(a.title);
 setADesc(a.description ?? "");
 setADue(a.dueDate ? a.dueDate.slice(0, 10) : "");
 setAMax(a.maxMarks != null ? String(a.maxMarks) : "");
 } else {
 setEditingId(null);
 setACourseId(assignmentFilter !== "all" ? assignmentFilter : (courses[0]?.id ?? ""));
 setATitle("");
 setADesc("");
 setADue("");
 setAMax("");
 }
 setDialogOpen(true);
 }

 async function submitAssignment(e: FormEvent<HTMLFormElement>) {
 e.preventDefault();
 if (!aCourseId) {
 toast({ title: "Course required", description: "Select the course this assignment belongs to.", variant: "destructive" });
 return;
 }
 if (!aTitle.trim()) {
 toast({ title: "Title required", description: "Give the assignment a clear title.", variant: "destructive" });
 return;
 }
 const maxTrim = aMax.trim();
 if (maxTrim !== "") {
 const n = Number(maxTrim);
 if (Number.isNaN(n) || n <= 0) {
 toast({ title: "Invalid max marks", description: "Enter a positive number or leave the field empty.", variant: "destructive" });
 return;
 }
 }
 setASubmitting(true);
 try {
 const body: Record<string, unknown> = { courseId: aCourseId, title: aTitle.trim(), description: aDesc.trim() };
 if (aDue) body.dueDate = aDue;
 if (maxTrim !== "") body.maxMarks = Number(maxTrim);
 if (editingId) {
 const { courseId: _ignored, ...updateBody } = body;
 await apiPut<{ assignment: AssignmentDTO }>(`/api/teacher/assignments?id=${encodeURIComponent(editingId)}`, updateBody);
 toast({ title: "Assignment updated", description: "Students were notified of the change." });
 } else {
 const data = await apiPost<{ assignment: AssignmentDTO; notified: number }>("/api/teacher/assignments", body);
 toast({ title: "Assignment published", description: `Assignment published to ${data.notified ?? 0} students.` });
 }
 setDialogOpen(false);
 void loadAssignments();
 } catch (err) {
 toast({ title: editingId ? "Couldn't update assignment" : "Couldn't publish assignment", description: errMsg(err), variant: "destructive" });
 } finally {
 setASubmitting(false);
 }
 }

 async function confirmDelete() {
 if (!deleteId) return;
 setDeleting(true);
 try {
 await apiDelete<{ deleted: boolean }>(`/api/teacher/assignments?id=${encodeURIComponent(deleteId)}`);
 setAssignments((prev) => prev.filter((a) => a.id !== deleteId));
 toast({ title: "Assignment deleted", description: "The assignment has been removed." });
 setDeleteId(null);
 } catch (err) {
 toast({ title: "Failed to delete", description: errMsg(err), variant: "destructive" });
 } finally {
 setDeleting(false);
 }
 }

 /* ---------------- results ---------------- */
 const [rCourseId, setRCourseId] = useState("");
 const [rCourse, setRCourse] = useState<CourseDTO | null>(null);
 const [results, setResults] = useState<ResultRow[]>([]);
 const [students, setStudents] = useState<StudentRow[]>([]);
 const [resultsLoading, setResultsLoading] = useState(false);
 const [examType, setExamType] = useState("ct1");
 const [marks, setMarks] = useState<Record<string, string>>({});
 const [savingResults, setSavingResults] = useState(false);

 const loadResults = useCallback(async (courseId: string) => {
 setResultsLoading(true);
 try {
 const data = await apiGet<{ results: ResultRow[]; students: StudentRow[]; course: CourseDTO }>(
 `/api/teacher/results?courseId=${encodeURIComponent(courseId)}`
 );
 setResults(data.results);
 setStudents(data.students);
 setRCourse(data.course);
 } catch (err) {
 toast({ title: "Failed to load results", description: errMsg(err), variant: "destructive" });
 } finally {
 setResultsLoading(false);
 }
 }, []);

 useEffect(() => {
 if (!rCourseId) {
 setResults([]);
 setStudents([]);
 setRCourse(null);
 return;
 }
 void loadResults(rCourseId);
 }, [rCourseId, loadResults]);

 /* Pre-fill marks from existing results of the selected exam type */
 useEffect(() => {
 const pre: Record<string, string> = {};
 for (const r of results) {
 if (r.examType === examType && !(r.studentId in pre)) pre[r.studentId] = String(r.marks);
 }
 setMarks(pre);
 }, [results, examType]);

 const filledCount = Object.values(marks).filter((v) => v.trim() !== "").length;

 async function saveResults() {
 if (!rCourseId) return;
 const entries: Array<{ studentId: string; marks: number; grade: string }> = [];
 for (const st of students) {
 const raw = (marks[st.id] ?? "").trim();
 if (raw === "") continue;
 const n = Number(raw);
 if (Number.isNaN(n) || n < 0 || n > 20) {
 toast({
 title: "Invalid marks",
 description: `${st.fullName}: enter a number between 0 and 20.`,
 variant: "destructive",
 });
 return;
 }
 entries.push({ studentId: st.id, marks: n, grade: computeGrade(n) });
 }
 if (entries.length === 0) {
 toast({ title: "Nothing to save", description: "Fill in at least one student's marks first.", variant: "destructive" });
 return;
 }
 setSavingResults(true);
 try {
 const data = await apiPost<{ saved: number }>("/api/teacher/results", {
 courseId: rCourseId,
 examType,
 entries,
 });
 toast({
 title: "Results saved",
 description: `${data.saved ?? entries.length} result${(data.saved ?? entries.length) === 1 ? "" : "s"} published to students.`,
 });
 await loadResults(rCourseId);
 } catch (err) {
 toast({ title: "Failed to save results", description: errMsg(err), variant: "destructive" });
 } finally {
 setSavingResults(false);
 }
 }

 /* ---------------- guards ---------------- */
 if (!mounted) return <PanelLoader label="Preparing your cockpit…" />;
 if (loading) return <PanelLoader label="Loading your dashboard…" />;

 const teacherName = user?.fullName ?? "Teacher";
 const departmentName = user?.departmentName ?? null;
 const longToday = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

 return (
 <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
 {/* ---------- header banner ---------- */}
 <motion.header
 initial={{ opacity: 0, y: 12 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.35 }}
 className="relative overflow-hidden rounded-2xl hero-gradient p-5 text-white shadow-lg shadow-[#241C15]/25 sm:p-6"
 >
 <div aria-hidden className="shimmer-line absolute inset-x-0 bottom-0 h-px" />
 <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
 <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-amber-300/20 blur-2xl" />
 <div className="relative flex flex-wrap items-center justify-between gap-4">
 <div className="min-w-0 space-y-1.5">
 <div className="flex flex-wrap items-center gap-2">
 <h1 className="text-xl font-bold sm:text-2xl">
 {greeting}, {teacherName}
 </h1>
 <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur">Teacher</span>
 </div>
 <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-white/85">
 {departmentName && (
 <span className="inline-flex items-center gap-1.5">
 <Building2 className="h-4 w-4" />
 {departmentName}
 </span>
 )}
 <span className="inline-flex items-center gap-1.5">
 <CalendarDays className="h-4 w-4" />
 {longToday}
 </span>
 </p>
 </div>
 <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
 <GraduationCap className="h-7 w-7" />
 </div>
 </div>
 </motion.header>

 {/* ---------- stats row ---------- */}
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
 <StatCard icon={CalendarClock} label="Today's Classes" value={stats.todayClasses} sub={dayLabel(today) ?? "Today"} tone="amber" delay={0} />
 <StatCard icon={CalendarDays} label="Weekly Classes" value={stats.totalClasses} sub="This week" tone="violet" delay={0.06} />
 <StatCard icon={BookOpen} label="Courses" value={stats.totalCourses} sub="Assigned to you" tone="fuchsia" delay={0.12} />
 <StatCard icon={History} label="Change History" value={changes.length} sub="Schedule changes" tone="rose" delay={0.18} />
 </div>

 {/* ---------- tabs ---------- */}
 <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
 <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
 <TabsTrigger value="schedule" className="py-1.5">My Schedule</TabsTrigger>
 <TabsTrigger value="attendance" className="py-1.5">Attendance</TabsTrigger>
 <TabsTrigger value="changes" className="py-1.5">Class Changes</TabsTrigger>
 <TabsTrigger value="assignments" className="py-1.5">Assignments</TabsTrigger>
 <TabsTrigger value="results" className="py-1.5">Results</TabsTrigger>
 <TabsTrigger value="notices" className="py-1.5">Notices</TabsTrigger>
 <TabsTrigger value="insights" className="py-1.5">Insights</TabsTrigger>
 </TabsList>

 {/* ============ MY SCHEDULE ============ */}
 <TabsContent value="schedule" className="mt-4 space-y-6">
 {schedules.length === 0 || syntheticSlots.length === 0 ? (
 <EmptyState
 icon={CalendarDays}
 title="No classes scheduled"
 hint="Your weekly timetable will appear here once the department assigns classes to you."
 />
 ) : (
 <FadeIn>
 <TimetableGrid schedules={gridSchedules} timeSlots={syntheticSlots} showTeacher={false} />
 </FadeIn>
 )}

 <SectionCard
 title={`Today · ${dayLabel(today) ?? "Classes"}`}
 icon={CalendarClock}
 action={<Badge variant="secondary">{todays.length} classes</Badge>}
 >
 {todays.length === 0 ? (
 <EmptyState icon={CalendarClock} title="No classes today" hint="Enjoy the free day — or get a head start on tomorrow." />
 ) : (
 <div className="space-y-3">
 {todays.map((s, i) => (
 <FadeIn key={s.id} index={i} className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 p-3">
 <div className="flex h-11 w-20 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-white shadow-md shadow-[#2D4F35]/30">
 <span className="flex items-center gap-1 text-xs font-bold">
 <Clock className="h-3 w-3" />
 {s.startTime}
 </span>
 <span className="text-[10px] opacity-80">to {s.endTime}</span>
 </div>
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-semibold">
 {s.courseCode} · {s.courseName}
 </p>
 <p className="flex items-center gap-1 text-xs text-muted-foreground">
 <MapPin className="h-3 w-3" /> Room {s.roomNumber}
 </p>
 </div>
 <span
 className={cn(
 "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
 s.classType === "lab"
 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
 : "bg-green/10 text-green"
 )}
 >
 {s.classType === "lab" ? "Lab" : "Theory"}
 </span>
 </FadeIn>
 ))}
 </div>
 )}
 </SectionCard>
 </TabsContent>

 {/* ============ ATTENDANCE ============ */}
 <TabsContent value="attendance" className="mt-4">
 <SectionCard
 title="Take Attendance"
 icon={UserCheck}
 action={
 attSchedule ? (
 <Badge variant="outline" className="border-border text-green ">
 {attSchedule.courseCode} · {attSchedule.startTime}
 </Badge>
 ) : undefined
 }
 >
 <div className="space-y-4">
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
 <div className="space-y-1.5">
 <Label htmlFor="att-class">Class</Label>
 <Select value={attScheduleId} onValueChange={setAttScheduleId}>
 <SelectTrigger id="att-class">
 <SelectValue placeholder="Select a class" />
 </SelectTrigger>
 <SelectContent>
 {schedules.length === 0 && (
 <SelectItem value="__none" disabled>
 No classes assigned to you
 </SelectItem>
 )}
 {schedules.map((s) => (
 <SelectItem key={s.id} value={s.id}>
 {s.courseCode} · {dayLabel(s.dayOfWeek)} · {s.startTime}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="att-date">Date</Label>
 <Input
 id="att-date"
 type="date"
 value={attDate}
 max={todayISO()}
 onChange={(e) => setAttDate(e.target.value)}
 />
 </div>
 </div>

 {attRecentDates.length > 0 && (
 <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
 <History className="h-3 w-3" />
 Recent dates:
 {attRecentDates.map((d) => (
 <button
 key={d}
 type="button"
 className="rounded-full border px-2 py-0.5 font-semibold text-[#2D4F35] transition-colors hover:bg-green/10 dark:text-[#7FB08F]"
 onClick={() => setAttDate(d)}
 >
 {fmtDate(d)}
 </button>
 ))}
 </div>
 )}

 {!attScheduleId ? (
 <EmptyState
 icon={UserCheck}
 title="Select a class"
 hint="Pick one of your classes and take daily attendance — absent students are notified automatically."
 />
 ) : attLoading ? (
 <PanelLoader label="Loading roster…" />
 ) : attStudents.length === 0 ? (
 <EmptyState
 icon={Users}
 title="No students enrolled"
 hint="No active students match this class batch (program + semester)."
 />
 ) : (
 <>
 <div className="flex flex-wrap items-center gap-2">
 <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300">
 Present {attSummary.present}
 </Badge>
 <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300">
 Absent {attSummary.absent}
 </Badge>
 <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300">
 Late {attSummary.late}
 </Badge>
 {attSummary.excused > 0 && (
 <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
 Excused {attSummary.excused}
 </Badge>
 )}
 {attSummary.unmarked > 0 && (
 <Badge variant="outline">Unmarked {attSummary.unmarked}</Badge>
 )}
 <span className="ml-auto flex gap-2">
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="h-8"
 onClick={() => setAllStatus("present")}
 >
 <CheckCheck className="mr-1 h-3.5 w-3.5" />
 All present
 </Button>
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="h-8"
 onClick={() => setAllStatus("")}
 disabled={Object.keys(attStatuses).length === 0}
 >
 Clear
 </Button>
 </span>
 </div>

 <div className="overflow-x-auto rounded-xl border">
 <Table>
 <TableHeader>
 <TableRow className="bg-muted/60">
 <TableHead className="min-w-[160px]">Student</TableHead>
 <TableHead className="w-[70px]">Roll</TableHead>
 <TableHead className="min-w-[260px] text-right">Status</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {attStudents.map((st) => {
 const current = attStatuses[st.id] ?? "";
 return (
 <TableRow key={st.id}>
 <TableCell>
 <p className="text-sm font-medium">{st.fullName}</p>
 <p className="text-[11px] text-muted-foreground">{st.studentIdNumber}</p>
 </TableCell>
 <TableCell className="text-xs text-muted-foreground">{st.rollNumber || "—"}</TableCell>
 <TableCell>
 <div
 role="group"
 aria-label={`Attendance status for ${st.fullName}`}
 className="flex flex-wrap justify-end gap-1"
 >
 {ATT_OPTIONS.map((opt) => {
 const isActive = current === opt.value;
 return (
 <button
 key={opt.value}
 type="button"
 aria-pressed={isActive}
 className={cn(
 "rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-all",
 isActive
 ? `${opt.active} border-transparent shadow-sm`
 : `bg-background ${opt.idle} hover:bg-muted`
 )}
 onClick={() =>
 setAttStatuses((m) => ({ ...m, [st.id]: isActive ? "" : opt.value }))
 }
 >
 {opt.label}
 </button>
 );
 })}
 </div>
 </TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 </Table>
 </div>

 <div className="flex justify-end">
 <Button className={GRADIENT_BTN} onClick={() => void saveAttendance()} disabled={attSaving}>
 {attSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
 {attSaving ? "Saving…" : `Save Attendance (${attSummary.present + attSummary.absent + attSummary.late + attSummary.excused})`}
 </Button>
 </div>
 </>
 )}
 </div>
 </SectionCard>
 </TabsContent>

 {/* ============ CLASS CHANGES ============ */}
 <TabsContent value="changes" className="mt-4 grid gap-6 lg:grid-cols-5">
 <FadeIn className="lg:col-span-2">
 <SectionCard title="Request a Change" icon={CalendarClock}>
 <form onSubmit={submitChange} className="space-y-4">
 <div className="space-y-1.5">
 <Label htmlFor="cc-schedule">Class</Label>
 <Select value={ccScheduleId} onValueChange={setCcScheduleId}>
 <SelectTrigger id="cc-schedule">
 <SelectValue placeholder="Select a class" />
 </SelectTrigger>
 <SelectContent>
 {schedules.length === 0 && (
 <SelectItem value="__none" disabled>
 No classes assigned to you
 </SelectItem>
 )}
 {schedules.map((s) => (
 <SelectItem key={s.id} value={s.id}>
 {s.courseCode} · {dayLabel(s.dayOfWeek)} · {s.startTime} · {s.roomNumber}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="cc-type">Change type</Label>
 <Select value={ccType} onValueChange={(v) => setCcType(v as ChangeFormType)}>
 <SelectTrigger id="cc-type">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="cancelled">Cancelled</SelectItem>
 <SelectItem value="rescheduled">Rescheduled (to another day)</SelectItem>
 <SelectItem value="extra_class">Extra Class</SelectItem>
 </SelectContent>
 </Select>
 <p className="text-xs text-muted-foreground">Time &amp; room changes are managed by your Department Head.</p>
 </div>

 {ccType !== "cancelled" && (
 <div className="space-y-1.5">
 <Label htmlFor="cc-day">{ccType === "extra_class" ? "Extra class day" : "New day"}</Label>
 <Select value={ccDay} onValueChange={setCcDay}>
 <SelectTrigger id="cc-day">
 <SelectValue placeholder="Pick a day" />
 </SelectTrigger>
 <SelectContent>
 {DAYS_OF_WEEK.map((d) => (
 <SelectItem key={d} value={d}>
 {DAY_LABELS[d]}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 {ccType === "rescheduled" && (
 <p className="text-xs text-muted-foreground">
 Class time stays the same — exact time changes need your Department Head.
 </p>
 )}
 </div>
 )}

 <div className="space-y-1.5">
 <Label htmlFor="cc-date">Effective date</Label>
 <Input id="cc-date" type="date" value={ccDate} min={todayStr} onChange={(e) => setCcDate(e.target.value)} />
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="cc-reason">Reason *</Label>
 <Textarea
 id="cc-reason"
 rows={3}
 placeholder="Explain briefly — this is shared with your students…"
 value={ccReason}
 onChange={(e) => setCcReason(e.target.value)}
 required
 />
 </div>

 <Button type="submit" disabled={ccSubmitting} className={cn("w-full", GRADIENT_BTN)}>
 {ccSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
 {ccSubmitting ? "Notifying…" : "Notify Students"}
 </Button>
 </form>
 </SectionCard>
 </FadeIn>

 <FadeIn index={1} className="lg:col-span-3">
 <SectionCard
 title="Change History"
 icon={History}
 action={<Badge variant="secondary">{changes.length} changes</Badge>}
 >
 {changes.length === 0 ? (
 <EmptyState
 icon={History}
 title="No changes yet"
 hint="Requests you submit will appear here, along with student notification status."
 />
 ) : (
 <div className={SCROLL}>
 <div className="space-y-3">
 {changes.map((c, i) => {
 const newDayLbl = dayLabel(c.newDay);
 return (
 <FadeIn key={c.id} index={i} className="rounded-xl border p-3">
 <div className="flex flex-wrap items-center gap-2">
 <ChangeTypeBadge type={c.changeType} />
 <span className="text-sm font-semibold">{c.courseCode}</span>
 <span className="truncate text-xs text-muted-foreground">{c.courseName}</span>
 <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{timeAgo(c.createdAt)}</span>
 </div>
 <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{c.reason}</p>
 <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
 {newDayLbl && <span>→ {newDayLbl}</span>}
 <span>Effective {fmtDate(c.effectiveDate)}</span>
 </div>
 </FadeIn>
 );
 })}
 </div>
 </div>
 )}
 </SectionCard>
 </FadeIn>
 </TabsContent>

 {/* ============ ASSIGNMENTS ============ */}
 <TabsContent value="assignments" className="mt-4 space-y-6">
 <SectionCard
 title="My Assignments"
 icon={ClipboardList}
 action={
 <div className="flex flex-wrap items-center gap-2">
 <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
 <SelectTrigger className="h-9 w-[170px] sm:w-[200px]">
 <SelectValue placeholder="All courses" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">All courses</SelectItem>
 {courses.map((c) => (
 <SelectItem key={c.id} value={c.id}>
 {c.code} · {c.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Button size="sm" className={cn("h-9", GRADIENT_BTN)} onClick={() => openAssignmentDialog()}>
 <Plus className="h-4 w-4" /> New Assignment
 </Button>
 </div>
 }
 >
 {assignmentsLoading ? (
 <PanelLoader label="Loading assignments…" />
 ) : assignments.length === 0 ? (
 <EmptyState
 icon={ClipboardList}
 title="No assignments"
 hint="Publish your first assignment — enrolled students are notified instantly."
 />
 ) : (
 <div className={SCROLL}>
 <div className="space-y-3">
 {assignments.map((a, i) => {
 const due = dueChip(a.dueDate);
 const code = a.courseCode ?? a.course?.code;
 return (
 <FadeIn key={a.id} index={i} className="rounded-xl border p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <div className="flex flex-wrap items-center gap-2">
 <h4 className="text-sm font-bold">{a.title}</h4>
 {code && (
 <Badge
 variant="outline"
 className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300"
 >
 {code}
 </Badge>
 )}
 </div>
 {a.description && (
 <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.description}</p>
 )}
 </div>
 <div className="flex shrink-0 items-center gap-1">
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 text-[#2D4F35] hover:bg-green/10 dark:text-[#7FB08F]"
 onClick={() => openAssignmentDialog(a)}
 aria-label={`Edit assignment ${a.title}`}
 >
 <Pencil className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 shrink-0 text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
 onClick={() => setDeleteId(a.id)}
 aria-label={`Delete assignment ${a.title}`}
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 </div>
 <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
 <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", due.cls)}>
 <CalendarDays className="h-3 w-3" />
 {due.text}
 </span>
 {a.maxMarks != null && (
 <span className="rounded-full bg-green/10 px-2 py-0.5 font-semibold text-green ">
 {a.maxMarks} marks
 </span>
 )}
 <span className="ml-auto text-muted-foreground">{timeAgo(a.createdAt)}</span>
 </div>
 </FadeIn>
 );
 })}
 </div>
 </div>
 )}
 </SectionCard>

 {/* New assignment dialog */}
 <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
 <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>{editingId ? "Edit Assignment" : "New Assignment"}</DialogTitle>
 <DialogDescription>
 {editingId
 ? "Update the details — enrolled students are notified of the change."
 : "Enrolled students of the selected course are notified instantly."}
 </DialogDescription>
 </DialogHeader>
 <form onSubmit={submitAssignment} className="space-y-4">
 <div className="space-y-1.5">
 <Label htmlFor="a-course">Course *</Label>
 <Select value={aCourseId} onValueChange={setACourseId}>
 <SelectTrigger id="a-course">
 <SelectValue placeholder="Select a course" />
 </SelectTrigger>
 <SelectContent>
 {courses.map((c) => (
 <SelectItem key={c.id} value={c.id}>
 {c.code} · {c.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="a-title">Title *</Label>
 <Input
 id="a-title"
 placeholder="e.g. Assignment 1 — Sorting algorithms"
 value={aTitle}
 onChange={(e) => setATitle(e.target.value)}
 required
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="a-desc">Description</Label>
 <Textarea
 id="a-desc"
 rows={3}
 placeholder="Instructions, chapters covered, submission format…"
 value={aDesc}
 onChange={(e) => setADesc(e.target.value)}
 />
 </div>
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
 <div className="space-y-1.5">
 <Label htmlFor="a-due">Due date</Label>
 <Input id="a-due" type="date" value={aDue} onChange={(e) => setADue(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="a-max">Max marks</Label>
 <Input
 id="a-max"
 type="number"
 min={1}
 placeholder="Optional, e.g. 20"
 value={aMax}
 onChange={(e) => setAMax(e.target.value)}
 />
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={aSubmitting}>
 Cancel
 </Button>
 <Button type="submit" className={GRADIENT_BTN} disabled={aSubmitting}>
 {aSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
 {aSubmitting ? "Saving…" : editingId ? "Save Changes" : "Publish Assignment"}
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>

 {/* Delete confirmation */}
 <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>Delete this assignment?</AlertDialogTitle>
 <AlertDialogDescription>
 This permanently removes the assignment for all students. This action cannot be undone.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
 <AlertDialogAction
 className="bg-rose-600 text-white hover:bg-rose-700"
 disabled={deleting}
 onClick={(e) => {
 e.preventDefault();
 void confirmDelete();
 }}
 >
 {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
 Delete
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </TabsContent>

 {/* ============ RESULTS ============ */}
 <TabsContent value="results" className="mt-4">
 <SectionCard
 title="Result Entry"
 icon={ClipboardCheck}
 action={
 rCourse ? (
 <Badge variant="outline" className="border-border text-green ">
 {rCourse.code} · {rCourse.name}
 </Badge>
 ) : undefined
 }
 >
 <div className="space-y-5">
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
 <div className="space-y-1.5">
 <Label htmlFor="r-course">Course</Label>
 <Select value={rCourseId} onValueChange={setRCourseId}>
 <SelectTrigger id="r-course">
 <SelectValue placeholder="Select a course" />
 </SelectTrigger>
 <SelectContent>
 {courses.length === 0 && (
 <SelectItem value="__none" disabled>
 No courses assigned to you
 </SelectItem>
 )}
 {courses.map((c) => (
 <SelectItem key={c.id} value={c.id}>
 {c.code} · {c.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="r-exam">Exam type</Label>
 <Select value={examType} onValueChange={setExamType} disabled={!rCourseId}>
 <SelectTrigger id="r-exam">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ct1">CT-1</SelectItem>
 <SelectItem value="ct2">CT-2</SelectItem>
 <SelectItem value="midterm">Midterm</SelectItem>
 <SelectItem value="final">Final</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>

 {!rCourseId ? (
 <EmptyState icon={BookOpen} title="Select a course" hint="Choose one of your courses to enter or update results." />
 ) : resultsLoading ? (
 <PanelLoader label="Loading results…" />
 ) : (
 <>
 {/* existing published entries */}
 <div className="space-y-1.5">
 <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
 <Users className="h-3.5 w-3.5" /> Published entries ({results.length})
 </p>
 {results.length === 0 ? (
 <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
 No results published for this course yet.
 </p>
 ) : (
 <div className={SCROLL}>
 <div className="space-y-2">
 {results.map((r, i) => (
 <FadeIn key={r.id} index={i} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2">
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-medium">{r.student.fullName}</p>
 <p className="text-[11px] text-muted-foreground">
 {r.student.rollNumber || r.student.studentIdNumber}
 </p>
 </div>
 <ExamTypeBadge examType={r.examType} />
 <span className="text-sm font-bold">
 {r.marks}
 <span className="text-xs font-normal text-muted-foreground">/{r.maxMarks}</span>
 </span>
 {r.grade && (
 <Badge
 variant="secondary"
 className={cn(
 r.grade.startsWith("A") || r.grade === "B"
 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
 : "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
 )}
 >
 {r.grade}
 </Badge>
 )}
 </FadeIn>
 ))}
 </div>
 </div>
 )}
 </div>

 <Separator />

 {/* entry sheet */}
 {students.length === 0 ? (
 <EmptyState icon={Users} title="No students enrolled" hint="No active students are enrolled in this course yet." />
 ) : (
 <>
 <div className="flex flex-wrap items-center justify-between gap-2">
 <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
 <Save className="h-3.5 w-3.5" /> Entry sheet · {EXAM_LABELS[examType] ?? examType}
 </p>
 <p className="text-[11px] text-muted-foreground">Marks (out of 20) · grades compute live</p>
 </div>
 <div className="overflow-x-auto rounded-xl border">
 <Table>
 <TableHeader>
 <TableRow className="bg-muted/60">
 <TableHead className="min-w-[180px]">Student</TableHead>
 <TableHead className="w-[70px]">Roll</TableHead>
 <TableHead className="w-[130px]">Marks (out of 20)</TableHead>
 <TableHead className="w-[70px] text-center">Grade</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {students.map((st) => {
 const val = marks[st.id] ?? "";
 const num = parseMarks(val);
 return (
 <TableRow key={st.id}>
 <TableCell>
 <p className="text-sm font-medium">{st.fullName}</p>
 <p className="text-[11px] text-muted-foreground">{st.studentIdNumber}</p>
 </TableCell>
 <TableCell className="text-xs text-muted-foreground">{st.rollNumber || "—"}</TableCell>
 <TableCell>
 <Input
 type="number"
 min={0}
 max={20}
 inputMode="numeric"
 className="h-8 w-24"
 placeholder="—"
 aria-label={`Marks for ${st.fullName}`}
 value={val}
 onChange={(e) => setMarks((m) => ({ ...m, [st.id]: e.target.value }))}
 />
 </TableCell>
 <TableCell className="text-center">
 {num === null ? (
 <span className="text-xs text-muted-foreground">—</span>
 ) : (
 <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold", gradeCls(num))}>
 {computeGrade(num)}
 </span>
 )}
 </TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 </Table>
 </div>
 <div className="flex justify-end">
 <Button className={GRADIENT_BTN} onClick={() => void saveResults()} disabled={savingResults}>
 {savingResults ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
 {savingResults ? "Saving…" : `Save All${filledCount > 0 ? ` (${filledCount})` : ""}`}
 </Button>
 </div>
 </>
 )}
 </>
 )}
 </div>
 </SectionCard>
 </TabsContent>

 {/* ============ NOTICES (teacher publishes) ============ */}
 <TabsContent value="notices" className="mt-4 grid gap-6 lg:grid-cols-5">
 <FadeIn className="lg:col-span-2">
 <SectionCard title="Publish a Notice" icon={Megaphone}>
 <form onSubmit={submitNotice} className="space-y-4">
 <div className="space-y-1.5">
 <Label htmlFor="n-title">Title *</Label>
 <Input
 id="n-title"
 placeholder="e.g. Tomorrow's class starts 15 minutes late"
 value={nTitle}
 onChange={(e) => setNTitle(e.target.value)}
 required
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="n-content">Content *</Label>
 <Textarea
 id="n-content"
 rows={4}
 placeholder="Write the full notice here…"
 value={nContent}
 onChange={(e) => setNContent(e.target.value)}
 required
 />
 </div>
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
 <div className="space-y-1.5">
 <Label htmlFor="n-category">Category</Label>
 <Select value={nCategory} onValueChange={setNCategory}>
 <SelectTrigger id="n-category">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="general">General</SelectItem>
 <SelectItem value="academic">Academic</SelectItem>
 <SelectItem value="exam">Exam</SelectItem>
 <SelectItem value="event">Event</SelectItem>
 <SelectItem value="assignment">Assignment</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="n-audience">Notify</Label>
 <Select value={nAudience} onValueChange={setNAudience}>
 <SelectTrigger id="n-audience">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">Students + Teachers</SelectItem>
 <SelectItem value="students">Students only</SelectItem>
 <SelectItem value="teachers">Teachers only</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="n-course">Scope (optional)</Label>
 <Select value={nCourseId} onValueChange={setNCourseId}>
 <SelectTrigger id="n-course">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="none">Whole department</SelectItem>
 {courses.map((c) => (
 <SelectItem key={c.id} value={c.id}>
 {c.code} · {c.name} (batch only)
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <p className="text-xs text-muted-foreground">
 Picking a course limits the notice to that batch (program + semester).
 </p>
 </div>
 <div className="flex items-center justify-between rounded-xl border p-3">
 <div>
 <p className="text-sm font-medium">Pinned</p>
 <p className="text-xs text-muted-foreground">Pinned notices stay on top of the feed.</p>
 </div>
 <Switch checked={nPinned} onCheckedChange={setNPinned} aria-label="Pin notice" />
 </div>
 <Button type="submit" disabled={nSubmitting} className={cn("w-full", GRADIENT_BTN)}>
 {nSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
 {nSubmitting ? "Publishing…" : "Publish Notice"}
 </Button>
 </form>
 </SectionCard>
 </FadeIn>

 <FadeIn index={1} className="lg:col-span-3">
 <SectionCard
 title="My Notices"
 icon={Megaphone}
 action={
 myNotices ? <Badge variant="secondary">{myNotices.length} published</Badge> : undefined
 }
 >
 {myNoticesLoading && !myNotices ? (
 <PanelLoader label="Loading your notices…" />
 ) : !myNotices || myNotices.length === 0 ? (
 <EmptyState
 icon={Megaphone}
 title="No notices yet"
 hint="Publish your first notice — students and teachers are notified instantly."
 />
 ) : (
 <div className={SCROLL}>
 <div className="space-y-3">
 {myNotices.map((n, i) => (
 <FadeIn key={n.id} index={i} className="rounded-xl border p-3">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <div className="flex items-center gap-1.5">
 {n.isPinned && <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
 <p className="truncate text-sm font-semibold">{n.title}</p>
 </div>
 <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.content}</p>
 </div>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Delete notice ${n.title}`}
 className="h-8 w-8 shrink-0 text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
 onClick={() => setNoticeDeleteId(n.id)}
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
 <CategoryBadge category={n.category} />
 <span className="ml-auto">{timeAgo(n.createdAt)}</span>
 </div>
 </FadeIn>
 ))}
 </div>
 </div>
 )}
 </SectionCard>
 </FadeIn>

 {/* notice delete confirm */}
 <AlertDialog open={noticeDeleteId !== null} onOpenChange={(o) => { if (!o) setNoticeDeleteId(null); }}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>Delete this notice?</AlertDialogTitle>
 <AlertDialogDescription>
 This removes the notice for everyone in the department. This action cannot be undone.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel disabled={noticeDeleting}>Cancel</AlertDialogCancel>
 <AlertDialogAction
 className="bg-rose-600 text-white hover:bg-rose-700"
 disabled={noticeDeleting}
 onClick={(e) => {
 e.preventDefault();
 void confirmNoticeDelete();
 }}
 >
 {noticeDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
 Delete
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </TabsContent>

 {/* ============ INSIGHTS (Day 42) ============ */}
 <TabsContent value="insights" className="mt-4 space-y-4">
 {insightsLoading && !insights ? (
 <PanelLoader label="Analysing your class performance…" />
 ) : !insights ? (
 <EmptyState
 icon={TrendingUp}
 title="Insights ready to load"
 hint="Open this tab again to analyse your results."
 />
 ) : insights.courseStats.length === 0 ? (
 <EmptyState
 icon={BarChart3}
 title="No results entered yet"
 hint="Enter results in the Results tab — insights will appear automatically."
 />
 ) : (
 <>
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
 <StatPill label="Mark Entries" value={insights.totalEntries} tone="green" />
 <StatPill label="Courses Graded" value={insights.courseStats.length} tone="navy" />
 <StatPill label="Assignments Given" value={insights.assignmentCount} tone="gold" />
 <StatPill
 label="Needs Attention"
 value={insights.courseStats.reduce((a, c) => a + c.atRiskStudents.length, 0)}
 tone="rust"
 />
 </div>

 <ChartCard title="Weekly Teaching Load" icon={CalendarDays} height={220}>
 <VBarChart data={insights.weeklyLoad} color={CHART_COLORS.green} valueLabel="Classes" />
 </ChartCard>

 {insights.courseStats.map((c) => (
 <SectionCard
 key={c.courseId}
 title={`${c.courseCode} — ${c.courseName}`}
 icon={BookOpen}
 action={
 <div className="flex items-center gap-2">
 <Badge variant="outline" className="font-display text-sm font-bold">
 {c.grade}
 </Badge>
 <Badge className="bg-[#2D4F35] text-white hover:bg-[#3A6B47]">
 Avg {c.avgPct}%
 </Badge>
 </div>
 }
 >
 <div className="space-y-4">
 <div className="grid gap-4 md:grid-cols-2">
 <div className="h-44">
 <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
 Average by exam type
 </p>
 <VBarChart
 data={c.examBreakdown.map((e) => ({
 label: e.examType === "ct1" ? "CT-1" : e.examType === "ct2" ? "CT-2" : e.examType.charAt(0).toUpperCase() + e.examType.slice(1),
 value: e.avgPct,
 }))}
 color={CHART_COLORS.gold}
 valueLabel="Avg %"
 />
 </div>
 <div className="h-44">
 <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
 Top performers (≥70%)
 </p>
 {c.topStudents.length === 0 ? (
 <div className="flex h-[85%] items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">
 No one above 70% yet
 </div>
 ) : (
 <HBarChart
 data={c.topStudents.map((s) => ({
 label: s.name.split(" ")[0] + (s.roll ? ` · ${s.roll}` : ""),
 value: s.avgPct,
 }))}
 color={CHART_COLORS.green}
 />
 )}
 </div>
 </div>

 {c.atRiskStudents.length > 0 && (
 <div className="rounded-xl border border-[#C8442E]/30 bg-[#C8442E]/5 p-3">
 <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#C8442E]">
 <AlertTriangle className="h-3.5 w-3.5" />
 At-risk students (below 40%) — {c.atRiskStudents.length}
 </p>
 <div className="flex flex-wrap gap-1.5">
 {c.atRiskStudents.map((s) => (
 <Badge key={s.name + s.roll} variant="outline" className="border-[#C8442E]/40 text-[#C8442E]">
 {s.name}
 {s.roll ? ` · ${s.roll}` : ""} — {s.avgPct}%
 </Badge>
 ))}
 </div>
 </div>
 )}
 </div>
 </SectionCard>
 ))}

 {insights.upcomingAssignments.length > 0 && (
 <SectionCard title="Upcoming deadlines" icon={ClipboardList}>
 <div className="space-y-2">
 {insights.upcomingAssignments.map((a) => (
 <div key={a.id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
 <p className="truncate font-medium">{a.title}</p>
 <Badge variant="outline">
 {a.dueDate ? new Date(a.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No due date"}
 </Badge>
 </div>
 ))}
 </div>
 </SectionCard>
 )}
 </>
 )}
 </TabsContent>
 </Tabs>
 </div>
 );
}

/* Client-side mount flag to avoid SSR/CSR date drift (greetings, "today" lists) */
const emptySubscribe = () => () => {};
function useMountedFlag(): boolean {
 return useSyncExternalStore(emptySubscribe, () => true, () => false);
}
