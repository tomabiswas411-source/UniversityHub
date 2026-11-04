"use client";

/* ============================================================
 TeacherStudentsTab — control every student of your batches.
 Scope by course (its program+semester batch) or by batch
 directly, search, then:
 • promote / hold / move the whole batch or a selection
 • activate / deactivate students
 • export the roster as CSV (Excel-ready)

 COST GUARD: roster = 1 GET (with 2 grouped aggregates for
 attendance %); actions = 1 POST each; exports = 1 GET of a
 server-built CSV string. No polling anywhere.
============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
 ArrowDown,
 ArrowUp,
 ArrowRightLeft,
 Download,
 Loader2,
 Search,
 ShieldOff,
 ShieldCheck,
 Users,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiGet, apiPost } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/components/dashboards/teacher-documents-tab";
import { EmptyState, GRADIENT_BTN, SectionCard } from "@/components/dashboards/dashboard-shared";
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
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import type { CourseDTO } from "@/types";

interface ProgramRow {
 id: string;
 name: string;
 shortName: string;
 semesterCount: number;
}
interface StudentControlRow {
 id: string;
 fullName: string;
 rollNumber: string | null;
 studentIdNumber: string | null;
 section: string | null;
 phone: string | null;
 semester: number | null;
 isActive: boolean;
 programId: string | null;
}
interface StudentsResponse {
 students: StudentControlRow[];
 attendancePct: Record<string, number>;
 programs: ProgramRow[];
 batch: { programId: string; semester: number } | null;
}

const SCROLL =
 "max-h-[420px] overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#2D4F35]/30 dark:[&::-webkit-scrollbar-thumb]:bg-[#4A7C58]/40";

function attChip(pct: number) {
 if (pct < 0) return <Badge variant="outline">No data</Badge>;
 const cls =
 pct >= 75
 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
 : pct >= 60
 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
 : "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300";
 return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold", cls)}>{pct}%</span>;
}

/** Scope + selection state for the Students tab. Lives in the parent
 *  panel so switching tabs doesn't wipe the teacher's filters. */
export type StudentsScopeState = {
  scopeMode: "course" | "batch";
  courseId: string;
  programId: string;
  semester: string;
  search: string;
  selectedIds: string[];
};

export function TeacherStudentsTab({
  courses,
  scope,
  onScopeChange,
}: {
  courses: CourseDTO[];
  /** Lifted scope/selection state — owned by the parent panel. */
  scope: StudentsScopeState;
  /** Patch-style updater so call sites stay one-liners. */
  onScopeChange: (patch: Partial<StudentsScopeState>) => void;
}) {
 /* ---------- scope (lifted to the panel; first course pre-highlighted) ---------- */
 const scopeMode = scope.scopeMode;
 const courseId = scope.courseId || courses[0]?.id || "";
 const programId = scope.programId;
 const semester = scope.semester;
 const search = scope.search;
 const [debouncedQ, setDebouncedQ] = useState(search.trim());

 useEffect(() => {
 const t = setTimeout(() => setDebouncedQ(search.trim()), 350);
 return () => clearTimeout(t);
 }, [search]);

 const scopeQuery = useMemo(() => {
 const p = new URLSearchParams();
 if (scopeMode === "course" && courseId) {
 p.set("courseId", courseId);
 } else if (scopeMode === "batch" && programId && semester) {
 p.set("programId", programId);
 p.set("semester", semester);
 }
 if (debouncedQ) p.set("q", debouncedQ);
 return p.toString();
 }, [scopeMode, courseId, programId, semester, debouncedQ]);

 /* ---------- data ---------- */
 const [data, setData] = useState<StudentsResponse | null>(null);
 const [loading, setLoading] = useState(false);
 /* Selection lives in the lifted scope; keep a Set view for lookups. */
 const selected = useMemo(() => new Set(scope.selectedIds), [scope.selectedIds]);
 /* Stale-response guard: only the newest roster fetch may touch state. */
 const reqSeq = useRef(0);
 /* Track the scope the last successful load served, so returning from
    another tab (same scope) doesn't wipe the selection but a real
    scope change does. */
 const lastLoadedScopeRef = useRef<string | null>(null);

 const load = useCallback(async () => {
 const seq = ++reqSeq.current;
 setLoading(true);
 try {
 // First call (no scope yet) still returns the programs list so the
 // batch selector is ready before the teacher picks anything.
 const qs = scopeQuery ? `?${scopeQuery}` : "";
 const res = await apiGet<StudentsResponse>(`/api/teacher/students${qs}`);
 if (seq !== reqSeq.current) return; // stale — a newer fetch superseded it
 setData(res);
 if (lastLoadedScopeRef.current !== scopeQuery) {
 onScopeChange({ selectedIds: [] });
 lastLoadedScopeRef.current = scopeQuery;
 }
 } catch (err) {
 if (seq !== reqSeq.current) return;
 toast({
 title: "Couldn't load students",
 description: err instanceof Error ? err.message : "Please try again.",
 variant: "destructive",
 });
 } finally {
 if (seq === reqSeq.current) setLoading(false);
 }
 }, [scopeQuery, onScopeChange]);

 useEffect(() => {
 void load();
 }, [load]);

 const students = data?.students ?? [];
 const programs = data?.programs ?? [];
 const activeProgram =
 programs.find((p) => p.id === (data?.batch?.programId ?? programId)) ?? programs[0] ?? null;
 const maxSemester = activeProgram?.semesterCount ?? 8;
 const allSelected = students.length > 0 && students.every((s) => selected.has(s.id));

 function toggleAll() {
 onScopeChange({ selectedIds: allSelected ? [] : students.map((s) => s.id) });
 }
 function toggleOne(id: string) {
 const next = new Set(scope.selectedIds);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 onScopeChange({ selectedIds: [...next] });
 }

 /* ---------- batch move ---------- */
 const [moveOpen, setMoveOpen] = useState(false);
 const [targetSemester, setTargetSemester] = useState("");
 const [moving, setMoving] = useState(false);

 async function confirmMove() {
 const target = Number(targetSemester);
 if (!Number.isInteger(target) || target < 1) {
 toast({ title: "Pick a target semester", variant: "destructive" });
 return;
 }
 setMoving(true);
 try {
 const res = await apiPost<{ moved: number; toSemester: number; alreadyThere: number }>(
 "/api/teacher/students-move",
 { studentIds: [...selected], toSemester: target }
 );
 toast({
 title: res.moved > 0 ? "Students moved" : "Nothing to change",
 description:
 res.moved > 0
 ? `${res.moved} student${res.moved === 1 ? "" : "s"} moved to semester ${res.toSemester} and notified.` +
 (res.alreadyThere ? ` ${res.alreadyThere} were already there.` : "")
 : "All selected students are already in that semester.",
 });
 setMoveOpen(false);
 setTargetSemester("");
 onScopeChange({ selectedIds: [] }); // moved students no longer match the selection
 void load();
 } catch (err) {
 toast({
 title: "Couldn't move students",
 description: err instanceof Error ? err.message : "Please try again.",
 variant: "destructive",
 });
 } finally {
 setMoving(false);
 }
 }

 /* ---------- activate / deactivate ---------- */
 const [statusBusy, setStatusBusy] = useState(false);
 /* Deactivate is destructive (logins are cut off) — confirm first. */
 const [deactivateOpen, setDeactivateOpen] = useState(false);

 async function setStatus(isActive: boolean) {
 if (selected.size === 0) return;
 setStatusBusy(true);
 try {
 const res = await apiPost<{ updated: number }>("/api/teacher/students-status", {
 studentIds: [...selected],
 isActive,
 });
 toast({
 title: isActive ? "Students activated" : "Students deactivated",
 description: `${res.updated} student${res.updated === 1 ? "" : "s"} ${isActive ? "can log in again" : "can no longer log in"}.`,
 });
 onScopeChange({ selectedIds: [] });
 void load();
 } catch (err) {
 toast({
 title: "Couldn't update students",
 description: err instanceof Error ? err.message : "Please try again.",
 variant: "destructive",
 });
 } finally {
 setStatusBusy(false);
 }
 }

 /* ---------- quick promote helpers for the whole batch ---------- */
 const currentBatchSemester = data?.batch?.semester ?? null;
 const canPromote = currentBatchSemester !== null && currentBatchSemester < maxSemester;

 function promoteBatch(delta: number) {
 if (currentBatchSemester === null) return;
 const target = currentBatchSemester + delta;
 if (target < 1 || target > maxSemester) return;
 onScopeChange({ selectedIds: students.map((s) => s.id) });
 setTargetSemester(String(target));
 setMoveOpen(true);
 }

 /* ---------- export ---------- */
 const [exporting, setExporting] = useState(false);
 async function exportRoster() {
 setExporting(true);
 try {
 // NOTE: the export endpoint always returns the FULL batch roster —
 // `q` is kept in the URL for future server-side filtering but is
 // currently ignored, so the toast says so honestly.
 const res = await apiGet<{ filename: string; csv: string }>(
 `/api/teacher/export?type=students&${scopeQuery}`
 );
 downloadCsv(res.filename, res.csv);
 const n = students.length;
 toast({
 title: n > 0 ? `Exported ${n} student${n === 1 ? "" : "s"} (full batch)` : "Exported full batch",
 description: "Exports always include the whole batch — the search filter isn't applied.",
 });
 } catch (err) {
 toast({
 title: "Couldn't export",
 description: err instanceof Error ? err.message : "Please try again.",
 variant: "destructive",
 });
 } finally {
 setExporting(false);
 }
 }

 const hasScope = scopeMode === "course" ? Boolean(courseId) : Boolean(programId && semester);

 return (
 <div className="mt-4 space-y-4">
 <SectionCard
 title="Student Control"
 icon={Users}
 action={
 hasScope && students.length > 0 ? (
 <Button variant="outline" size="sm" className="h-8" onClick={() => void exportRoster()} disabled={exporting}>
 {exporting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
 CSV
 </Button>
 ) : undefined
 }
 >
 <div className="space-y-4">
 {/* scope controls */}
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
 <div className="space-y-1.5">
 <Label htmlFor="st-scope">Scope</Label>
 <Select
 value={scopeMode}
 onValueChange={(v) => {
 onScopeChange({ scopeMode: v as "course" | "batch", search: "" });
 }}
 >
 <SelectTrigger id="st-scope">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="course">By course</SelectItem>
 <SelectItem value="batch">By program &amp; semester</SelectItem>
 </SelectContent>
 </Select>
 </div>

 {scopeMode === "course" ? (
 <div className="space-y-1.5">
 <Label htmlFor="st-course">Course (its batch)</Label>
 <Select value={courseId} onValueChange={(v) => onScopeChange({ courseId: v })}>
 <SelectTrigger id="st-course">
 <SelectValue placeholder="Select a course" />
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
 ) : (
 <>
 <div className="space-y-1.5">
 <Label htmlFor="st-program">Program</Label>
 <Select
 value={programId}
 onValueChange={(v) => {
 onScopeChange({ programId: v, semester: "1" });
 }}
 >
 <SelectTrigger id="st-program">
 <SelectValue placeholder="Select program" />
 </SelectTrigger>
 <SelectContent>
 {(data?.programs ?? []).map((p) => (
 <SelectItem key={p.id} value={p.id}>
 {p.shortName}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="st-semester">Semester</Label>
 <Select value={semester} onValueChange={(v) => onScopeChange({ semester: v })}>
 <SelectTrigger id="st-semester">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {Array.from({ length: activeProgram?.semesterCount ?? 8 }, (_, i) => i + 1).map((n) => (
 <SelectItem key={n} value={String(n)}>
 Semester {n}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </>
 )}

 <div className="space-y-1.5">
 <Label htmlFor="st-search">Search</Label>
 <div className="relative">
 <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
 <Input
 id="st-search"
 value={search}
 onChange={(e) => onScopeChange({ search: e.target.value })}
 placeholder="Name, roll or ID…"
 className="pl-8"
 />
 </div>
 </div>
 </div>

 {/* batch quick actions */}
 {data?.batch && students.length > 0 && (
 <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2.5">
 <Badge variant="secondary">
 {students.length} student{students.length === 1 ? "" : "s"} · Semester {data.batch.semester}
 </Badge>
 <span className="text-[11px] text-muted-foreground">Quick actions on the whole batch:</span>
 {canPromote && (
 <Button
 type="button"
 size="sm"
 className="h-7 bg-[#2D4F35] text-white hover:bg-[#3A6B47]"
 onClick={() => promoteBatch(1)}
 >
 <ArrowUp className="mr-1 h-3.5 w-3.5" /> Promote all → Sem {currentBatchSemester + 1}
 </Button>
 )}
 {currentBatchSemester !== null && currentBatchSemester > 1 && (
 <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => promoteBatch(-1)}>
 <ArrowDown className="mr-1 h-3.5 w-3.5" /> Back to Sem {currentBatchSemester - 1}
 </Button>
 )}
 <Button
 type="button"
 size="sm"
 variant="outline"
 className="h-7"
 onClick={() => {
 onScopeChange({ selectedIds: students.map((s) => s.id) });
 setTargetSemester("");
 setMoveOpen(true);
 }}
 >
 <ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Move to…
 </Button>
 <span className="ml-auto text-[11px] text-muted-foreground">“Hold” = simply don&apos;t move them.</span>
 </div>
 )}

 {/* selection action bar */}
 {selected.size > 0 && (
 <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#2D4F35]/30 bg-[#2D4F35]/5 p-2.5">
 <Badge className="bg-[#2D4F35] text-white hover:bg-[#3A6B47]">{selected.size} selected</Badge>
 <Button
 type="button"
 size="sm"
 className="h-7 bg-[#2D4F35] text-white hover:bg-[#3A6B47]"
 onClick={() => {
 setTargetSemester("");
 setMoveOpen(true);
 }}
 >
 <ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Move to semester…
 </Button>
 <Button
 type="button"
 size="sm"
 variant="outline"
 className="h-7"
 onClick={() => setDeactivateOpen(true)}
 disabled={statusBusy}
 >
 {statusBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="mr-1 h-3.5 w-3.5" />}
 Deactivate
 </Button>
 <Button
 type="button"
 size="sm"
 variant="outline"
 className="h-7"
 onClick={() => void setStatus(true)}
 disabled={statusBusy}
 >
 <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Activate
 </Button>
 <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => onScopeChange({ selectedIds: [] })}>
 Clear selection
 </Button>
 </div>
 )}

 {/* roster */}
 {!hasScope ? (
 <EmptyState icon={Users} title="Pick a scope" hint="Choose a course or a program & semester to see its students." />
 ) : loading && !data ? (
 <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
 <Loader2 className="h-5 w-5 animate-spin" /> Loading students…
 </div>
 ) : students.length === 0 ? (
 <EmptyState
 icon={Users}
 title="No students found"
 hint={debouncedQ ? "No one matches your search in this batch." : "This batch has no enrolled students yet."}
 />
 ) : (
 <div className={SCROLL}>
 <Table>
 <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
 <TableRow>
 <TableHead className="w-10">
 <Checkbox
 aria-label="Select all students"
 checked={allSelected}
 onCheckedChange={toggleAll}
 />
 </TableHead>
 <TableHead>Student</TableHead>
 <TableHead className="w-16">Roll</TableHead>
 <TableHead className="hidden sm:table-cell">Section</TableHead>
 <TableHead className="hidden md:table-cell">Phone</TableHead>
 <TableHead className="w-20">Sem</TableHead>
 <TableHead className="w-20 text-right">Attend.</TableHead>
 <TableHead className="w-20 text-right">Status</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {students.map((s) => (
 <TableRow key={s.id} className={cn(!s.isActive && "opacity-60")}>
 <TableCell>
 <Checkbox
 aria-label={`Select ${s.fullName}`}
 checked={selected.has(s.id)}
 onCheckedChange={() => toggleOne(s.id)}
 />
 </TableCell>
 <TableCell>
 <p className="text-sm font-medium">{s.fullName}</p>
 <p className="text-[11px] text-muted-foreground">{s.studentIdNumber}</p>
 </TableCell>
 <TableCell className="text-xs text-muted-foreground">{s.rollNumber || "—"}</TableCell>
 <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{s.section || "—"}</TableCell>
 <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{s.phone || "—"}</TableCell>
 <TableCell className="text-xs font-semibold">{s.semester ?? "—"}</TableCell>
 <TableCell className="text-right">{attChip(data?.attendancePct[s.id] ?? -1)}</TableCell>
 <TableCell className="text-right">
 {s.isActive ? (
 <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
 Active
 </span>
 ) : (
 <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
 Inactive
 </span>
 )}
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}
 </div>
 </SectionCard>

 {/* move confirm dialog */}
 <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle>Move {selected.size} student{selected.size === 1 ? "" : "s"}</DialogTitle>
 <DialogDescription>
 They will be moved to the semester you pick and each gets a notification with their new semester.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-1.5 py-1">
 <Label htmlFor="move-sem">Target semester</Label>
 <Select value={targetSemester} onValueChange={setTargetSemester}>
 <SelectTrigger id="move-sem">
 <SelectValue placeholder="Pick semester" />
 </SelectTrigger>
 <SelectContent>
 {Array.from({ length: maxSemester }, (_, i) => i + 1).map((n) => (
 <SelectItem key={n} value={String(n)}>
 Semester {n}
 {currentBatchSemester !== null && n > currentBatchSemester
 ? " (promotion)"
 : currentBatchSemester !== null && n < currentBatchSemester
 ? " (back)"
 : ""}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setMoveOpen(false)}>
 Cancel
 </Button>
 <Button className={GRADIENT_BTN} onClick={() => void confirmMove()} disabled={moving || !targetSemester}>
 {moving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-1 h-4 w-4" />}
 Move {selected.size}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* deactivate confirm — same destructive-action pattern as delete */}
 <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>
 Deactivate {selected.size} student{selected.size === 1 ? "" : "s"}?
 </AlertDialogTitle>
 <AlertDialogDescription>
 Students won&apos;t be able to log in until you reactivate them. Their records, results and
 attendance history are kept.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel disabled={statusBusy}>Cancel</AlertDialogCancel>
 <AlertDialogAction
 className="bg-rose-600 text-white hover:bg-rose-700"
 disabled={statusBusy}
 onClick={(e) => {
 e.preventDefault();
 setDeactivateOpen(false);
 void setStatus(false);
 }}
 >
 {statusBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
 Deactivate
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}
