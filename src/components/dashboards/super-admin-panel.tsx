"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
 Building2,
 CalendarDays,
 ChartNoAxesColumn,
 Check,
 CreditCard,
 DollarSign,
 GraduationCap,
 Layers,
 Loader2,
 MoreVertical,
 Network,
 Pencil,
 Plus,
 Power,
 ShieldCheck,
 Trash2,
 TrendingUp,
 UserPlus,
 Users,
} from "lucide-react";

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
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
 EmptyState,
 GRADIENT_BTN,
 PanelLoader,
 SectionCard,
 StatCard,
} from "@/components/dashboards/dashboard-shared";
import {
 CHART_COLORS,
 ChartCard,
 DonutChart,
 StatPill,
 TrendAreaChart,
} from "@/components/dashboards/analytics-charts";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import type {
 DepartmentDTO,
 PlanDTO,
 PlatformStatsDTO,
 UniversityDTO,
} from "@/types";

/* ============================================================
 SuperAdminPanel — "Aurora Royale" control tower for the
 platform System Manager: universities + plans & billing.
 ============================================================ */

/* ---------------- local API row types ---------------- */

interface SuperStats extends PlatformStatsDTO {
 totalUsers: number;
}

interface UniversityRow extends Omit<UniversityDTO, "_count"> {
 planName: string | null;
 _count?: { departments: number; users: number };
}

/** Server may deliver PlanDTO.features as a JSON string — normalised locally. */
type PlanRow = Omit<PlanDTO, "features"> & { features: unknown };

type DetailDept = Omit<DepartmentDTO, "_count"> & {
 _count?: {
 teachers?: number;
 students?: number;
 users?: number;
 schedules?: number;
 };
};

interface UniversityDetailResponse {
 university: UniversityDTO & {
 plan: PlanRow | null;
 departments: DetailDept[];
 users: Array<{ id: string; fullName: string; email: string | null }>;
 };
}

interface SuperOverview {
 stats: SuperStats;
 universities: UniversityRow[];
 plans: PlanRow[];
}

interface PlatformAnalytics {
 hasData: boolean;
 growthMonths: { label: string; value: number }[];
 userGrowth: { label: string; value: number }[];
 planDistribution: { label: string; value: number }[];
 mrr: number;
 arr: number;
 payingUniversities: number;
 perUniversity: {
 id: string;
 name: string;
 plan: string;
 departments: number;
 users: number;
 schedules: number;
 isActive: boolean;
 }[];
 roles: { label: string; value: number }[];
 totalSchedules: number;
}

/* ---------------- form state ---------------- */

interface UniFormState {
 name: string;
 slug: string;
 shortName: string;
 address: string;
 contactEmail: string;
 contactPhone: string;
 websiteURL: string;
 planId: string; // "" = no plan
 aboutText: string;
 isActive: boolean;
}

const EMPTY_UNI_FORM: UniFormState = {
 name: "",
 slug: "",
 shortName: "",
 address: "",
 contactEmail: "",
 contactPhone: "",
 websiteURL: "",
 planId: "",
 aboutText: "",
 isActive: true,
};

interface DeptFormState {
 name: string;
 shortName: string;
 code: string;
 description: string;
 building: string;
 contactEmail: string;
 contactPhone: string;
}

const EMPTY_DEPT_FORM: DeptFormState = {
 name: "",
 shortName: "",
 code: "",
 description: "",
 building: "",
 contactEmail: "",
 contactPhone: "",
};

interface ProvisionFormState {
 name: string;
 email: string;
 password: string;
 role: "dept_admin" | "teacher";
}

const EMPTY_PROVISION_FORM: ProvisionFormState = {
 name: "",
 email: "",
 password: "",
 role: "dept_admin",
};

interface PlanDraft {
 name: string;
 tagline: string;
 priceMonthly: string;
 priceYearly: string;
 maxDepartments: string;
 maxStudents: string;
 maxTeachers: string;
 isActive: boolean;
 features: string; // comma separated
}

/* ---------------- small helpers ---------------- */

function errMsg(err: unknown): string {
 return err instanceof Error ? err.message : "Something went wrong";
}

function slugify(value: string): string {
 return value
 .toLowerCase()
 .trim()
 .replace(/[^a-z0-9]+/g, "-")
 .replace(/^-+|-+$/g, "");
}

function parseFeatures(raw: unknown): string[] {
 if (Array.isArray(raw)) return raw.map((f) => String(f));
 if (typeof raw === "string") {
 try {
 const parsed: unknown = JSON.parse(raw);
 if (Array.isArray(parsed)) return parsed.map((f) => String(f));
 } catch {
 return raw
 .split(",")
 .map((s) => s.trim())
 .filter(Boolean);
 }
 }
 return [];
}

function planToDraft(p: PlanRow): PlanDraft {
 return {
 name: p.name,
 tagline: p.tagline ?? "",
 priceMonthly: String(p.priceMonthly ?? 0),
 priceYearly: String(p.priceYearly ?? 0),
 maxDepartments: String(p.maxDepartments ?? -1),
 maxStudents: String(p.maxStudents ?? -1),
 maxTeachers: String(p.maxTeachers ?? -1),
 isActive: p.isActive,
 features: parseFeatures(p.features).join(", "),
 };
}

function fmtMoney(v: number): string {
 return v <= 0 ? "Free" : `৳${v.toLocaleString("en-US")}`;
}

function fmtLimit(v: number): string {
 return v < 0 ? "Unlimited" : v.toLocaleString("en-US");
}

function numOr(value: string, fallback: number): number {
 const n = Number(value);
 return Number.isFinite(n) ? n : fallback;
}

/* ---------------- tiny UI atoms ---------------- */

function Field({
 label,
 required,
 children,
}: {
 label: string;
 required?: boolean;
 children: ReactNode;
}) {
 return (
 <div className="space-y-1.5">
 <Label className="text-xs font-medium text-muted-foreground">
 {label}
 {required && <span className="text-rose-500"> *</span>}
 </Label>
 {children}
 </div>
 );
}

function DeptCountChips({ dept }: { dept: DetailDept }) {
 const c = dept._count;
 const chips: string[] = [];
 if (typeof c?.teachers === "number") chips.push(`${c.teachers} teachers`);
 if (typeof c?.students === "number") chips.push(`${c.students} students`);
 if (typeof c?.users === "number") chips.push(`${c.users} members`);
 if (typeof c?.schedules === "number") chips.push(`${c.schedules} slots`);
 if (chips.length === 0) return null;
 return (
 <div className="mt-1.5 flex flex-wrap gap-1">
 {chips.map((chip) => (
 <span
 key={chip}
 className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
 >
 {chip}
 </span>
 ))}
 </div>
 );
}

/* ============================================================
 Main panel
 ============================================================ */

export function SuperAdminPanel() {
 const user = useAuthStore((s) => s.user);

 /* -------- data -------- */
 const [loading, setLoading] = useState(true);
 const [stats, setStats] = useState<SuperStats | null>(null);
 const [universities, setUniversities] = useState<UniversityRow[]>([]);
 const [plans, setPlans] = useState<PlanRow[]>([]);
 const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>({});
 const [savingPlanId, setSavingPlanId] = useState<string | null>(null);

 /* -------- university dialog -------- */
 const [uniDialogOpen, setUniDialogOpen] = useState(false);
 const [editingUniId, setEditingUniId] = useState<string | null>(null);
 const [uniForm, setUniForm] = useState<UniFormState>(EMPTY_UNI_FORM);
 const [slugTouched, setSlugTouched] = useState(false);
 const [saving, setSaving] = useState(false);

 /* -------- activate / deactivate university -------- */
 const [toggleTarget, setToggleTarget] = useState<UniversityRow | null>(null);
 const [toggling, setToggling] = useState(false);

 /* -------- departments (expanded card) -------- */
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const [detail, setDetail] = useState<DetailDept[] | null>(null);
 const [deptLoading, setDeptLoading] = useState(false);
 // Monotonic request id — stale detail responses are ignored (expand A→B race)
 const detailReqRef = useRef(0);
 const [deptDialogOpen, setDeptDialogOpen] = useState(false);
 const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
 const [deptForm, setDeptForm] = useState<DeptFormState>(EMPTY_DEPT_FORM);
 const [deptSaving, setDeptSaving] = useState(false);
 const [deleteDeptTarget, setDeleteDeptTarget] = useState<DetailDept | null>(null);
 const [deleting, setDeleting] = useState(false);

 /* -------- provision dept head / teacher (per department) -------- */
 const [provisionDept, setProvisionDept] = useState<DetailDept | null>(null);
 const [provisionForm, setProvisionForm] = useState<ProvisionFormState>(EMPTY_PROVISION_FORM);
 const [provisionSaving, setProvisionSaving] = useState(false);

 /* ---------------- analytics (Day 43, lazy) ---------------- */
 const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
 const [analyticsLoading, setAnalyticsLoading] = useState(false);
 // Refetch every time the analytics tab is opened — never serve a stale cache.
 const loadAnalytics = useCallback(async () => {
 if (analyticsLoading) return;
 setAnalyticsLoading(true);
 try {
 setAnalytics(await apiGet<PlatformAnalytics>("/api/admin/analytics"));
 } catch {
 setAnalytics(null);
 } finally {
 setAnalyticsLoading(false);
 }
 }, [analyticsLoading]);

 const handleTabChange = useCallback(
 (v: string) => {
 if (v === "analytics") void loadAnalytics();
 },
 [loadAnalytics]
 );

 /* ---------------- loaders ---------------- */

 const load = useCallback(async (silent = false) => {
 if (!silent) setLoading(true);
 try {
 const res = await apiGet<SuperOverview>("/api/admin/overview");
 const list = res.plans ?? [];
 setStats(res.stats ?? null);
 setUniversities(res.universities ?? []);
 setPlans(list);
 setPlanDrafts(
 Object.fromEntries(list.map((p) => [p.id, planToDraft(p)]))
 );
 } catch (err) {
 toast({
 title: "Failed to load platform data",
 description: errMsg(err),
 variant: "destructive",
 });
 } finally {
 if (!silent) setLoading(false);
 }
 }, []);

 useEffect(() => {
 void load();
 }, [load]);

 const fetchDetail = useCallback(async (id: string) => {
 const reqId = ++detailReqRef.current;
 setDeptLoading(true);
 try {
 const res = await apiGet<UniversityDetailResponse>(
 `/api/admin/university?id=${id}`
 );
 if (reqId !== detailReqRef.current) return; // stale — a newer request won
 setDetail(res.university?.departments ?? []);
 } catch (err) {
 if (reqId !== detailReqRef.current) return;
 toast({
 title: "Failed to load departments",
 description: errMsg(err),
 variant: "destructive",
 });
 } finally {
 if (reqId === detailReqRef.current) setDeptLoading(false);
 }
 }, []);

 /* ---------------- university CRUD ---------------- */

 function openAddUniversity() {
 setEditingUniId(null);
 setUniForm(EMPTY_UNI_FORM);
 setSlugTouched(false);
 setUniDialogOpen(true);
 }

 function openEditUniversity(u: UniversityRow) {
 setEditingUniId(u.id);
 setUniForm({
 name: u.name,
 slug: u.slug,
 shortName: u.shortName ?? "",
 address: u.address ?? "",
 contactEmail: u.contactEmail ?? "",
 contactPhone: u.contactPhone ?? "",
 websiteURL: u.websiteURL ?? "",
 planId: u.planId ?? "",
 aboutText: u.aboutText ?? "",
 isActive: u.isActive,
 });
 setSlugTouched(true);
 setUniDialogOpen(true);
 }

 async function submitUniversity() {
 const name = uniForm.name.trim();
 const slug = slugify(uniForm.slug);
 if (!name || !slug) {
 toast({
 title: "Missing information",
 description: "University name and slug are required.",
 variant: "destructive",
 });
 return;
 }
 setSaving(true);
 const body = {
 name,
 slug,
 shortName: uniForm.shortName.trim() || null,
 address: uniForm.address.trim() || null,
 contactEmail: uniForm.contactEmail.trim() || null,
 contactPhone: uniForm.contactPhone.trim() || null,
 websiteURL: uniForm.websiteURL.trim() || null,
 aboutText: uniForm.aboutText.trim() || null,
 planId: uniForm.planId || null,
 };
 try {
 if (editingUniId) {
 await apiPut(`/api/admin/universities?id=${editingUniId}`, {
 ...body,
 isActive: uniForm.isActive,
 });
 toast({
 title: "University updated",
 description: `${name} saved successfully.`,
 });
 } else {
 await apiPost("/api/admin/universities", body);
 toast({
 title: "University created",
 description: `${name} is ready — add its departments next.`,
 });
 }
 setUniDialogOpen(false);
 await load(true);
 } catch (err) {
 toast({
 title: "Could not save university",
 description: errMsg(err),
 variant: "destructive",
 });
 } finally {
 setSaving(false);
 }
 }

 async function confirmToggleUniversity() {
 if (!toggleTarget) return;
 const target = toggleTarget;
 setToggling(true);
 try {
 if (target.isActive) {
 // Deactivate = soft delete per platform contract
 await apiDelete(`/api/admin/universities?id=${target.id}`);
 } else {
 await apiPut(`/api/admin/universities?id=${target.id}`, {
 isActive: true,
 });
 }
 toast({
 title: target.isActive ? "University deactivated" : "University activated",
 description: target.name,
 });
 setToggleTarget(null);
 await load(true);
 } catch (err) {
 toast({
 title: "Could not update status",
 description: errMsg(err),
 variant: "destructive",
 });
 } finally {
 setToggling(false);
 }
 }

 /* ---------------- department CRUD (inside a university) ---------------- */

 function toggleDepartments(u: UniversityRow) {
 if (expandedId === u.id) {
 setExpandedId(null);
 setDetail(null);
 return;
 }
 setExpandedId(u.id);
 setDetail(null);
 void fetchDetail(u.id);
 }

 function openAddDept() {
 setEditingDeptId(null);
 setDeptForm(EMPTY_DEPT_FORM);
 setDeptDialogOpen(true);
 }

 function openEditDept(d: DetailDept) {
 setEditingDeptId(d.id);
 setDeptForm({
 name: d.name,
 shortName: d.shortName ?? "",
 code: d.code ?? "",
 description: d.description ?? "",
 building: d.building ?? "",
 contactEmail: d.contactEmail ?? "",
 contactPhone: d.contactPhone ?? "",
 });
 setDeptDialogOpen(true);
 }

 async function submitDept() {
 if (!expandedId) return;
 const name = deptForm.name.trim();
 if (!name) {
 toast({
 title: "Missing information",
 description: "Department name is required.",
 variant: "destructive",
 });
 return;
 }
 setDeptSaving(true);
 const short =
 deptForm.shortName.trim() ||
 name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() ||
 "DEPT";
 const fields = {
 name,
 shortName: short,
 code: deptForm.code.trim() || short.toUpperCase(),
 description: deptForm.description.trim() || null,
 building: deptForm.building.trim() || null,
 contactEmail: deptForm.contactEmail.trim() || null,
 contactPhone: deptForm.contactPhone.trim() || null,
 };
 try {
 if (editingDeptId) {
 await apiPut(`/api/department?id=${editingDeptId}`, fields);
 toast({ title: "Department updated", description: name });
 } else {
 await apiPost("/api/department", { universityId: expandedId, ...fields });
 toast({ title: "Department added", description: name });
 }
 setDeptDialogOpen(false);
 await Promise.all([load(true), fetchDetail(expandedId)]);
 } catch (err) {
 toast({
 title: "Could not save department",
 description: errMsg(err),
 variant: "destructive",
 });
 } finally {
 setDeptSaving(false);
 }
 }

 async function confirmDeleteDept() {
 if (!deleteDeptTarget) return;
 const target = deleteDeptTarget;
 setDeleting(true);
 try {
 await apiDelete(`/api/department?id=${target.id}`);
 toast({
 title: "Department deleted",
 description: `${target.name} has been permanently removed.`,
 });
 setDeleteDeptTarget(null);
 const jobs: Array<Promise<void>> = [load(true)];
 if (expandedId) jobs.push(fetchDetail(expandedId));
 await Promise.all(jobs);
 } catch (err) {
 toast({
 title: "Could not delete department",
 description: errMsg(err),
 variant: "destructive",
 });
 } finally {
 setDeleting(false);
 }
 }

 /* ---------------- provision dept head / teacher ---------------- */

 function openProvision(d: DetailDept) {
 setProvisionDept(d);
 setProvisionForm(EMPTY_PROVISION_FORM);
 }

 async function submitProvision() {
 if (!provisionDept) return;
 const name = provisionForm.name.trim();
 const email = provisionForm.email.trim();
 const password = provisionForm.password;
 if (!name || !email || !password) {
 toast({
 title: "Missing information",
 description: "Name, email and password are required.",
 variant: "destructive",
 });
 return;
 }
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
 toast({
 title: "Invalid email",
 description: "Please enter a valid email address.",
 variant: "destructive",
 });
 return;
 }
 if (password.length < 4) {
 toast({
 title: "Weak password",
 description: "Password must be at least 4 characters.",
 variant: "destructive",
 });
 return;
 }
 setProvisionSaving(true);
 try {
 await apiPost("/api/admin/users", {
 name,
 email,
 password,
 departmentId: provisionDept.id,
 role: provisionForm.role,
 });
 toast({
 title:
 provisionForm.role === "dept_admin"
 ? "Department Head added"
 : "Teacher added",
 description: `${name} can now sign in with email + password.`,
 });
 setProvisionDept(null);
 const jobs: Array<Promise<void>> = [load(true)];
 if (expandedId) jobs.push(fetchDetail(expandedId));
 await Promise.all(jobs);
 } catch (err) {
 toast({
 title: "Could not create account",
 description: errMsg(err),
 variant: "destructive",
 });
 } finally {
 setProvisionSaving(false);
 }
 }

 /* ---------------- plans ---------------- */

 function patchPlan(id: string, patch: Partial<PlanDraft>) {
 setPlanDrafts((prev) =>
 prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev
 );
 }

 async function savePlan(id: string) {
 const d = planDrafts[id];
 if (!d) return;
 setSavingPlanId(id);
 try {
 await apiPut(`/api/admin/plans?id=${id}`, {
 name: d.name.trim() || "Plan",
 tagline: d.tagline.trim() || null,
 priceMonthly: numOr(d.priceMonthly, 0),
 priceYearly: numOr(d.priceYearly, 0),
 maxDepartments: numOr(d.maxDepartments, -1),
 maxStudents: numOr(d.maxStudents, -1),
 maxTeachers: numOr(d.maxTeachers, -1),
 isActive: d.isActive,
 features: d.features
 .split(",")
 .map((s) => s.trim())
 .filter(Boolean),
 });
 toast({ title: "Plan updated", description: `${d.name} saved successfully.` });
 await load(true);
 } catch (err) {
 toast({
 title: "Could not save plan",
 description: errMsg(err),
 variant: "destructive",
 });
 } finally {
 setSavingPlanId(null);
 }
 }

 /* ============================================================
 Render
 ============================================================ */

 if (loading) {
 return <PanelLoader label="Loading platform overview…" />;
 }

 return (
 <div className="space-y-6">
 {/* ---------- header banner ---------- */}
 <motion.div
 initial={{ opacity: 0, y: 12 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.35 }}
 >
 <header className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#241C15] via-[#2D4F35] to-[#241C15] p-5 text-white shadow-lg shadow-[#2D4F35]/25 sm:p-7">
 <div
 aria-hidden
 className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"
 />
 <div
 aria-hidden
 className="pointer-events-none absolute -bottom-20 left-1/4 h-44 w-44 rounded-full bg-amber-300/20 blur-3xl"
 />
 <div className="relative flex flex-wrap items-start justify-between gap-4">
 <div className="min-w-0">
 <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">
 UniversityHub · Platform Administration
 </p>
 <h1 className="mt-1.5 text-2xl font-bold sm:text-3xl">
 System Control Center
 </h1>
 <p className="mt-1.5 max-w-xl text-sm text-white/85">
 Welcome back, {user?.fullName ?? "Admin"} — manage universities,
 plans and platform-wide activity.
 </p>
 </div>
 <Badge className="gap-1.5 border border-white/30 bg-white/15 px-3 py-1.5 text-white backdrop-blur">
 <ShieldCheck className="h-4 w-4" />
 Super Admin
 </Badge>
 </div>
 </header>
 </motion.div>

 {/* ---------- stats row ---------- */}
 <section
 aria-label="Platform statistics"
 className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5"
 >
 <StatCard
 icon={Building2}
 label="Universities"
 value={stats?.totalUniversities ?? 0}
 sub={stats ? `${stats.activeUniversities} active` : undefined}
 tone="amber"
 delay={0}
 />
 <StatCard
 icon={Network}
 label="Departments"
 value={stats?.totalDepartments ?? 0}
 tone="violet"
 delay={0.05}
 />
 <StatCard
 icon={GraduationCap}
 label="Teachers"
 value={stats?.totalTeachers ?? 0}
 tone="fuchsia"
 delay={0.1}
 />
 <StatCard
 icon={Users}
 label="Students"
 value={stats?.totalStudents ?? 0}
 tone="emerald"
 delay={0.15}
 />
 <StatCard
 icon={CalendarDays}
 label="Active Routines"
 value={stats?.totalSchedules ?? 0}
 sub={
 stats && typeof stats.totalUsers === "number"
 ? `${stats.totalUsers} platform users`
 : undefined
 }
 tone="rose"
 delay={0.2}
 />
 </section>

 {/* ---------- tabs ---------- */}
 <Tabs defaultValue="universities" onValueChange={handleTabChange} className="gap-4">
 <TabsList className="no-scrollbar h-11 w-full justify-start overflow-x-auto rounded-xl p-1 sm:h-9">
 <TabsTrigger value="universities" className="shrink-0 gap-1.5 px-4">
 <Building2 className="h-3.5 w-3.5" />
 Universities
 </TabsTrigger>
 <TabsTrigger value="plans" className="shrink-0 gap-1.5 px-4">
 <CreditCard className="h-3.5 w-3.5" />
 Plans &amp; Billing
 </TabsTrigger>
 <TabsTrigger value="analytics" className="shrink-0 gap-1.5 px-4">
 <ChartNoAxesColumn className="h-3.5 w-3.5" />
 Analytics
 </TabsTrigger>
 </TabsList>

 {/* ===== Universities tab ===== */}
 <TabsContent value="universities" className="space-y-4">
 <SectionCard
 title={`Universities (${universities.length})`}
 icon={Building2}
 action={
 <Button
 className={cn("h-10 sm:h-9", GRADIENT_BTN)}
 onClick={openAddUniversity}
 >
 <Plus className="h-4 w-4" />
 Add University
 </Button>
 }
 >
 {universities.length === 0 ? (
 <EmptyState
 icon={Building2}
 title="No universities yet"
 hint="Create your first university to onboard departments, teachers and students."
 />
 ) : (
 <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
 {universities.map((u, i) => (
 <motion.div
 key={u.id}
 initial={{ opacity: 0, y: 12 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: Math.min(i * 0.04, 0.24), duration: 0.3 }}
 className="rounded-2xl border bg-card p-4 shadow-sm"
 >
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <span
 aria-label={u.isActive ? "Active" : "Inactive"}
 className={cn(
 "h-2 w-2 shrink-0 rounded-full",
 u.isActive ? "bg-emerald-500" : "bg-rose-500"
 )}
 />
 <h3 className="truncate text-sm font-bold sm:text-base">
 {u.name}
 </h3>
 </div>
 <p className="mt-0.5 truncate text-xs text-muted-foreground">
 /{u.slug}
 </p>
 </div>
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Actions for ${u.name}`}
 className="h-10 w-10 shrink-0 rounded-xl sm:h-9 sm:w-9"
 >
 <MoreVertical className="h-4 w-4" />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="w-52">
 <DropdownMenuItem onClick={() => openEditUniversity(u)}>
 <Pencil className="h-4 w-4" />
 Edit
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => toggleDepartments(u)}>
 <Layers className="h-4 w-4" />
 View Departments
 </DropdownMenuItem>
 <DropdownMenuSeparator />
 <DropdownMenuItem
 onClick={() => setToggleTarget(u)}
 className="text-rose-600 focus:text-rose-600 dark:text-rose-400"
 >
 <Power className="h-4 w-4" />
 {u.isActive ? "Deactivate" : "Activate"}
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>

 <div className="mt-3 flex flex-wrap items-center gap-1.5">
 {u.shortName && (
 <Badge className="bg-green/10 text-green">
 {u.shortName}
 </Badge>
 )}
 <Badge
 className={cn(
 u.planName
 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
 : "bg-muted text-muted-foreground"
 )}
 >
 {u.planName ?? "No plan"}
 </Badge>
 <Badge variant="outline">
 {u._count?.departments ?? 0} depts
 </Badge>
 <Badge variant="outline">{u._count?.users ?? 0} users</Badge>
 <span
 className={cn(
 "ml-auto text-[11px] font-semibold",
 u.isActive ? "text-emerald-600" : "text-rose-600"
 )}
 >
 {u.isActive ? "Active" : "Inactive"}
 </span>
 </div>

 {/* expanded departments */}
 {expandedId === u.id && (
 <div className="mt-3">
 <Separator className="mb-3" />
 <div className="flex items-center justify-between gap-2">
 <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
 Departments ({detail?.length ?? "…"})
 </p>
 <Button
 size="sm"
 variant="outline"
 className="h-10 sm:h-8"
 onClick={openAddDept}
 >
 <Plus className="h-3.5 w-3.5" />
 Add
 </Button>
 </div>
 <div className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1">
 {deptLoading ? (
 <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
 <Loader2 className="h-4 w-4 animate-spin" />
 Loading departments…
 </div>
 ) : detail && detail.length === 0 ? (
 <p className="py-6 text-center text-xs text-muted-foreground">
 No departments yet — add the first one.
 </p>
 ) : (
 detail?.map((d) => (
 <div
 key={d.id}
 className="flex items-start justify-between gap-2 rounded-xl border p-2.5"
 >
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold">
 {d.name}
 </p>
 <p className="truncate text-[11px] text-muted-foreground">
 {[d.shortName, d.code, d.building]
 .filter(Boolean)
 .join(" · ") || "—"}
 </p>
 <DeptCountChips dept={d} />
 </div>
 <div className="flex shrink-0 gap-1">
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Add head or teacher to ${d.name}`}
 title="Add Head/Teacher"
 className="h-10 w-10 sm:h-8 sm:w-8"
 onClick={() => openProvision(d)}
 >
 <UserPlus className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Edit ${d.name}`}
 className="h-10 w-10 sm:h-8 sm:w-8"
 onClick={() => openEditDept(d)}
 >
 <Pencil className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Delete ${d.name}`}
 className="h-10 w-10 text-rose-600 hover:text-rose-700 sm:h-8 sm:w-8"
 onClick={() => setDeleteDeptTarget(d)}
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 </div>
 ))
 )}
 </div>
 </div>
 )}
 </motion.div>
 ))}
 </div>
 )}
 </SectionCard>
 </TabsContent>

 {/* ===== Plans & Billing tab ===== */}
 <TabsContent value="plans" className="space-y-4">
 <SectionCard
 title="Plans & Billing"
 icon={CreditCard}
 action={
 <Badge variant="outline">{plans.length} plans</Badge>
 }
 >
 {plans.length === 0 ? (
 <EmptyState
 icon={CreditCard}
 title="No plans configured"
 hint="Subscription plans appear here once seeded on the server."
 />
 ) : (
 <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
 {plans.map((p, i) => {
 const draft = planDrafts[p.id];
 if (!draft) return null;
 const mo = numOr(draft.priceMonthly, 0);
 const yr = numOr(draft.priceYearly, 0);
 const isFree = mo <= 0 && yr <= 0;
 return (
 <motion.div
 key={p.id}
 initial={{ opacity: 0, y: 12 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: Math.min(i * 0.05, 0.25), duration: 0.3 }}
 className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm"
 >
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <h3 className="truncate font-bold">{p.name}</h3>
 <p className="truncate text-xs text-muted-foreground">
 {p.slug}
 </p>
 </div>
 {isFree ? (
 <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
 Free forever
 </Badge>
 ) : (
 <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
 {fmtMoney(mo)}/mo
 </Badge>
 )}
 </div>

 {/* price + limits summary */}
 <div className="mt-3 rounded-xl bg-gradient-to-r from-gold/20 to-gold/5 p-3 text-center dark:from-gold/10 dark:to-gold/5">
 {isFree ? (
 <p className="text-xl font-extrabold text-amber-600">
 ৳0 <span className="text-xs font-medium">forever</span>
 </p>
 ) : (
 <p className="text-base font-extrabold">
 {fmtMoney(mo)}
 <span className="text-[11px] font-medium text-muted-foreground">
 /mo
 </span>
 <span className="mx-1.5 text-muted-foreground">·</span>
 {fmtMoney(yr)}
 <span className="text-[11px] font-medium text-muted-foreground">
 /yr
 </span>
 </p>
 )}
 <p className="mt-1 text-[11px] text-muted-foreground">
 {fmtLimit(numOr(draft.maxDepartments, -1))} depts ·{" "}
 {fmtLimit(numOr(draft.maxStudents, -1))} students ·{" "}
 {fmtLimit(numOr(draft.maxTeachers, -1))} teachers
 </p>
 </div>

 {/* editable fields */}
 <div className="mt-3 grid gap-2.5">
 <Field label="Tagline">
 <Input
 value={draft.tagline}
 placeholder="Everything a growing university needs"
 onChange={(e) =>
 patchPlan(p.id, { tagline: e.target.value })
 }
 />
 </Field>
 <div className="grid grid-cols-2 gap-2">
 <Field label="Price / month (৳)">
 <Input
 type="number"
 min={0}
 value={draft.priceMonthly}
 onChange={(e) =>
 patchPlan(p.id, { priceMonthly: e.target.value })
 }
 />
 </Field>
 <Field label="Price / year (৳)">
 <Input
 type="number"
 min={0}
 value={draft.priceYearly}
 onChange={(e) =>
 patchPlan(p.id, { priceYearly: e.target.value })
 }
 />
 </Field>
 </div>
 <div className="grid grid-cols-3 gap-2">
 <Field label="Max depts">
 <Input
 type="number"
 value={draft.maxDepartments}
 onChange={(e) =>
 patchPlan(p.id, { maxDepartments: e.target.value })
 }
 />
 </Field>
 <Field label="Max students">
 <Input
 type="number"
 value={draft.maxStudents}
 onChange={(e) =>
 patchPlan(p.id, { maxStudents: e.target.value })
 }
 />
 </Field>
 <Field label="Max teachers">
 <Input
 type="number"
 value={draft.maxTeachers}
 onChange={(e) =>
 patchPlan(p.id, { maxTeachers: e.target.value })
 }
 />
 </Field>
 </div>
 <p className="-mt-1 text-[10px] text-muted-foreground">
 Tip: use -1 for unlimited limits.
 </p>
 <Field label="Features (comma separated)">
 <Input
 value={draft.features}
 placeholder="Custom domain, Priority support, Analytics"
 onChange={(e) =>
 patchPlan(p.id, { features: e.target.value })
 }
 />
 </Field>
 <div className="flex items-center justify-between rounded-xl border px-3 py-2">
 <span className="text-sm font-medium">Active</span>
 <Switch
 checked={draft.isActive}
 onCheckedChange={(v) => patchPlan(p.id, { isActive: v })}
 aria-label={`Toggle ${p.name} active`}
 />
 </div>
 </div>

 <div className="mt-auto pt-3">
 <Button
 className={cn("h-10 w-full", GRADIENT_BTN)}
 disabled={savingPlanId === p.id}
 onClick={() => void savePlan(p.id)}
 >
 {savingPlanId === p.id ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <Check className="h-4 w-4" />
 )}
 Save plan
 </Button>
 </div>
 </motion.div>
 );
 })}
 </div>
 )}
 </SectionCard>
 </TabsContent>

 {/* ===== Analytics tab (Day 43) ===== */}
 <TabsContent value="analytics" className="space-y-4">
 {analyticsLoading && !analytics ? (
 <PanelLoader label="Loading platform insights…" />
 ) : !analytics ? (
 <EmptyState
 icon={ChartNoAxesColumn}
 title="Analytics unavailable"
 hint="Switch tabs and come back to retry."
 />
 ) : (
 <>
 {/* Revenue KPIs */}
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
 <StatPill label="MRR" value={`৳${analytics.mrr.toLocaleString()}`} tone="green" />
 <StatPill label="ARR" value={`৳${analytics.arr.toLocaleString()}`} tone="navy" />
 <StatPill label="Paying Universities" value={analytics.payingUniversities} tone="gold" />
 <StatPill label="Active Routines" value={analytics.totalSchedules} tone="rust" />
 </div>

 <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
 <ChartCard title="Universities joined per month" icon={TrendingUp} height={250}>
 <TrendAreaChart
 data={analytics.growthMonths}
 color={CHART_COLORS.green}
 valueLabel="New universities"
 hint="Growth chart fills in as institutions onboard."
 />
 </ChartCard>
 <ChartCard title="New users per month" icon={Users} height={250}>
 <TrendAreaChart
 data={analytics.userGrowth}
 color={CHART_COLORS.navy}
 valueLabel="New users"
 />
 </ChartCard>
 <ChartCard title="Plan distribution" icon={Layers} height={280}>
 <DonutChart
 data={analytics.planDistribution}
 hint="Assign plans to universities to see the revenue mix."
 />
 </ChartCard>
 <ChartCard title="Users by role" icon={ShieldCheck} height={280}>
 <DonutChart data={analytics.roles} />
 </ChartCard>
 </div>

 <SectionCard title="University usage leaderboard" icon={Building2}>
 <div className="overflow-x-auto">
 <table className="w-full min-w-[560px] text-sm">
 <thead>
 <tr className="border-b text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
 <th className="py-2 pr-3">University</th>
 <th className="py-2 pr-3">Plan</th>
 <th className="py-2 pr-3 text-right">Depts</th>
 <th className="py-2 pr-3 text-right">Users</th>
 <th className="py-2 text-right">Routines</th>
 </tr>
 </thead>
 <tbody>
 {analytics.perUniversity.map((u) => (
 <tr key={u.id} className="border-b last:border-0">
 <td className="py-2.5 pr-3 font-semibold">
 <span className="inline-flex items-center gap-1.5">
 {u.name}
 {!u.isActive && (
 <Badge variant="outline" className="text-[10px] text-muted-foreground">
 inactive
 </Badge>
 )}
 </span>
 </td>
 <td className="py-2.5 pr-3">
 <Badge variant="outline">{u.plan}</Badge>
 </td>
 <td className="py-2.5 pr-3 text-right tabular-nums">{u.departments}</td>
 <td className="py-2.5 pr-3 text-right tabular-nums">{u.users}</td>
 <td className="py-2.5 text-right tabular-nums">{u.schedules}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </SectionCard>
 </>
 )}
 </TabsContent>
 </Tabs>

 {/* ---------- add / edit university dialog ---------- */}
 <Dialog open={uniDialogOpen} onOpenChange={setUniDialogOpen}>
 <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>
 {editingUniId ? "Edit University" : "Add University"}
 </DialogTitle>
 <DialogDescription>
 {editingUniId
 ? "Update institution details, subscription plan and status."
 : "Register a new university on the platform (default settings are created automatically)."}
 </DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-1 gap-3">
 <Field label="University name" required>
 <Input
 value={uniForm.name}
 placeholder="e.g. International University of Business Agriculture"
 onChange={(e) =>
 setUniForm((f) => ({
 ...f,
 name: e.target.value,
 slug: slugTouched ? f.slug : slugify(e.target.value),
 }))
 }
 />
 </Field>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Slug (URL)" required>
 <Input
 value={uniForm.slug}
 placeholder="iubat"
 onChange={(e) => {
 setSlugTouched(true);
 setUniForm((f) => ({ ...f, slug: e.target.value }));
 }}
 />
 </Field>
 <Field label="Short name">
 <Input
 value={uniForm.shortName}
 placeholder="IUBAT"
 onChange={(e) =>
 setUniForm((f) => ({ ...f, shortName: e.target.value }))
 }
 />
 </Field>
 </div>
 <Field label="Address">
 <Input
 value={uniForm.address}
 placeholder="4 Embankment Drive Road, Dhaka"
 onChange={(e) =>
 setUniForm((f) => ({ ...f, address: e.target.value }))
 }
 />
 </Field>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Contact email">
 <Input
 type="email"
 value={uniForm.contactEmail}
 placeholder="info@university.edu"
 onChange={(e) =>
 setUniForm((f) => ({ ...f, contactEmail: e.target.value }))
 }
 />
 </Field>
 <Field label="Contact phone">
 <Input
 value={uniForm.contactPhone}
 placeholder="+880 2 xxx xxxx"
 onChange={(e) =>
 setUniForm((f) => ({ ...f, contactPhone: e.target.value }))
 }
 />
 </Field>
 </div>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Website">
 <Input
 value={uniForm.websiteURL}
 placeholder="https://www.university.edu"
 onChange={(e) =>
 setUniForm((f) => ({ ...f, websiteURL: e.target.value }))
 }
 />
 </Field>
 <Field label="Subscription plan">
 <Select
 value={uniForm.planId || "none"}
 onValueChange={(v) =>
 setUniForm((f) => ({ ...f, planId: v === "none" ? "" : v }))
 }
 >
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Select plan" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="none">No plan</SelectItem>
 {plans.map((p) => (
 <SelectItem key={p.id} value={p.id}>
 {p.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </Field>
 </div>
 <Field label="About">
 <Textarea
 rows={3}
 value={uniForm.aboutText}
 placeholder="A short public description of the university…"
 onChange={(e) =>
 setUniForm((f) => ({ ...f, aboutText: e.target.value }))
 }
 />
 </Field>
 {editingUniId && (
 <div className="flex items-center justify-between rounded-xl border p-3">
 <div>
 <p className="text-sm font-medium">Active</p>
 <p className="text-xs text-muted-foreground">
 Inactive universities are hidden from public pages.
 </p>
 </div>
 <Switch
 checked={uniForm.isActive}
 onCheckedChange={(v) =>
 setUniForm((f) => ({ ...f, isActive: v }))
 }
 aria-label="Toggle university active"
 />
 </div>
 )}
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => setUniDialogOpen(false)}>
 Cancel
 </Button>
 <Button
 className={cn("h-10", GRADIENT_BTN)}
 onClick={() => void submitUniversity()}
 disabled={saving}
 >
 {saving && <Loader2 className="h-4 w-4 animate-spin" />}
 {editingUniId ? "Save changes" : "Create university"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* ---------- add / edit department dialog ---------- */}
 <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
 <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>
 {editingDeptId ? "Edit Department" : "Add Department"}
 </DialogTitle>
 <DialogDescription>
 Departments group teachers, students, courses and routines.
 </DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-1 gap-3">
 <Field label="Department name" required>
 <Input
 value={deptForm.name}
 placeholder="e.g. Computer Science & Engineering"
 onChange={(e) =>
 setDeptForm((f) => ({ ...f, name: e.target.value }))
 }
 />
 </Field>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Short name">
 <Input
 value={deptForm.shortName}
 placeholder="CSE"
 onChange={(e) =>
 setDeptForm((f) => ({ ...f, shortName: e.target.value }))
 }
 />
 </Field>
 <Field label="Code">
 <Input
 value={deptForm.code}
 placeholder="CSE-101"
 onChange={(e) =>
 setDeptForm((f) => ({ ...f, code: e.target.value }))
 }
 />
 </Field>
 </div>
 <Field label="Building">
 <Input
 value={deptForm.building}
 placeholder="Building A, Level 3"
 onChange={(e) =>
 setDeptForm((f) => ({ ...f, building: e.target.value }))
 }
 />
 </Field>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Contact email">
 <Input
 type="email"
 value={deptForm.contactEmail}
 placeholder="cse@university.edu"
 onChange={(e) =>
 setDeptForm((f) => ({ ...f, contactEmail: e.target.value }))
 }
 />
 </Field>
 <Field label="Contact phone">
 <Input
 value={deptForm.contactPhone}
 placeholder="+880 2 xxx xxxx"
 onChange={(e) =>
 setDeptForm((f) => ({ ...f, contactPhone: e.target.value }))
 }
 />
 </Field>
 </div>
 <Field label="Description">
 <Textarea
 rows={3}
 value={deptForm.description}
 placeholder="What does this department do?"
 onChange={(e) =>
 setDeptForm((f) => ({ ...f, description: e.target.value }))
 }
 />
 </Field>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => setDeptDialogOpen(false)}>
 Cancel
 </Button>
 <Button
 className={cn("h-10", GRADIENT_BTN)}
 onClick={() => void submitDept()}
 disabled={deptSaving}
 >
 {deptSaving && <Loader2 className="h-4 w-4 animate-spin" />}
 {editingDeptId ? "Save changes" : "Add department"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* ---------- provision dept head / teacher dialog ---------- */}
 <Dialog
 open={!!provisionDept}
 onOpenChange={(open) => {
 if (!open) setProvisionDept(null);
 }}
 >
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle>Add Head / Teacher</DialogTitle>
 <DialogDescription>
 {provisionDept
 ? `Create a Department Head or Teacher account inside ${provisionDept.name}. They sign in with email + password.`
 : "Create a staff account for this department."}
 </DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-1 gap-3">
 <Field label="Full name" required>
 <Input
 value={provisionForm.name}
 placeholder="Dr. Ayesha Rahman"
 onChange={(e) =>
 setProvisionForm((f) => ({ ...f, name: e.target.value }))
 }
 />
 </Field>
 <Field label="Email" required>
 <Input
 type="email"
 value={provisionForm.email}
 placeholder="ayesha@university.edu"
 onChange={(e) =>
 setProvisionForm((f) => ({ ...f, email: e.target.value }))
 }
 />
 </Field>
 <Field label="Password" required>
 <Input
 type="password"
 value={provisionForm.password}
 placeholder="At least 4 characters"
 onChange={(e) =>
 setProvisionForm((f) => ({ ...f, password: e.target.value }))
 }
 />
 </Field>
 <Field label="Role">
 <Select
 value={provisionForm.role}
 onValueChange={(v) =>
 setProvisionForm((f) => ({
 ...f,
 role: v as ProvisionFormState["role"],
 }))
 }
 >
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Select role" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="dept_admin">Department Head</SelectItem>
 <SelectItem value="teacher">Teacher</SelectItem>
 </SelectContent>
 </Select>
 </Field>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => setProvisionDept(null)}>
 Cancel
 </Button>
 <Button
 className={cn("h-10", GRADIENT_BTN)}
 onClick={() => void submitProvision()}
 disabled={provisionSaving}
 >
 {provisionSaving && <Loader2 className="h-4 w-4 animate-spin" />}
 Create account
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* ---------- activate / deactivate university confirm ---------- */}
 <AlertDialog
 open={!!toggleTarget}
 onOpenChange={(open) => {
 if (!open) setToggleTarget(null);
 }}
 >
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>
 {toggleTarget?.isActive ? "Deactivate" : "Activate"} “
 {toggleTarget?.name}”?
 </AlertDialogTitle>
 <AlertDialogDescription>
 {toggleTarget?.isActive
 ? "The university will be soft-deleted — its departments, teachers and students lose access until it is re-activated."
 : "The university and all of its departments will become visible and active again."}
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancel</AlertDialogCancel>
 <AlertDialogAction
 className={cn(
 toggleTarget?.isActive
 ? "bg-rose-600 text-white hover:bg-rose-700"
 : "h-10",
 !toggleTarget?.isActive && GRADIENT_BTN
 )}
 onClick={() => void confirmToggleUniversity()}
 disabled={toggling}
 >
 {toggleTarget?.isActive ? "Deactivate" : "Activate"}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 {/* ---------- delete department confirm ---------- */}
 <AlertDialog
 open={!!deleteDeptTarget}
 onOpenChange={(open) => {
 if (!open) setDeleteDeptTarget(null);
 }}
 >
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>
 Delete “{deleteDeptTarget?.name}”?
 </AlertDialogTitle>
 <AlertDialogDescription>
 This permanently removes the department along with its courses,
 routines and member links. This action cannot be undone.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancel</AlertDialogCancel>
 <AlertDialogAction
 className="bg-rose-600 text-white hover:bg-rose-700"
 onClick={() => void confirmDeleteDept()}
 disabled={deleting}
 >
 Delete permanently
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}
