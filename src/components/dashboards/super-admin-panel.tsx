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
 RefreshCw,
 ShieldCheck,
 Trash2,
 TrendingUp,
 TriangleAlert,
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
 DASHBOARD_SECTIONS,
 EmptyState,
 GRADIENT_BTN,
 MOBILE_TABS_LIST,
 MOBILE_TABS_FADE,
 MOBILE_TAB_TRIGGER,
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
import { SuperAdminUsersCard } from "@/components/dashboards/super-admin-users-card";
import { SuperAdminSystemCard } from "@/components/dashboards/super-admin-system-card";
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

export function SuperAdminPanel({
 tab,
 onTabChange,
}: {
 /** Active section — mirrors the ?tab= URL param (sidebar rail). */
 tab?: string;
 onTabChange?: (tab: string) => void;
}) {
 const user = useAuthStore((s) => s.user);

 /* Section state — URL-driven when valid (sidebar rail), local pill
    clicks sync back to the URL via onTabChange. */
 const [localTab, setLocalTab] = useState("universities");
 const activeTab = DASHBOARD_SECTIONS.super_admin.some((s) => s.value === tab)
 ? tab
 : localTab;

 /* -------- data -------- */
 const [loading, setLoading] = useState(true);
 const [stats, setStats] = useState<SuperStats | null>(null);
 const [universities, setUniversities] = useState<UniversityRow[]>([]);
 const [plans, setPlans] = useState<PlanRow[]>([]);
 const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>({});
 const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
 /* -------- plan create dialog + plan delete confirm -------- */
 const [planDialogOpen, setPlanDialogOpen] = useState(false);
 const [planForm, setPlanForm] = useState({
 name: "",
 tagline: "",
 priceMonthly: "0",
 priceYearly: "0",
 maxDepartments: "1",
 maxStudents: "100",
 maxTeachers: "5",
 features: "",
 });
 const [creatingPlan, setCreatingPlan] = useState(false);
 const [planDeleteTarget, setPlanDeleteTarget] = useState<PlanRow | null>(null);
 const [deletingPlan, setDeletingPlan] = useState(false);

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
 const [analyticsError, setAnalyticsError] = useState<string | null>(null);
 // Monotonic request id — rapid tab toggles must not interleave responses.
 const analyticsReqRef = useRef(0);
 // Refetch every time the analytics tab is opened — never serve a stale cache.
 const loadAnalytics = useCallback(async () => {
 if (analyticsLoading) return;
 const seq = ++analyticsReqRef.current;
 setAnalyticsLoading(true);
 try {
 const data = await apiGet<PlatformAnalytics>("/api/admin/analytics");
 if (seq !== analyticsReqRef.current) return; // stale — a newer request won
 setAnalytics(data);
 setAnalyticsError(null);
 } catch (err) {
 if (seq !== analyticsReqRef.current) return;
 // Silent catch left the tab looking permanently empty — surface a
 // retryable error message instead (see the Analytics tab render).
 setAnalytics(null);
 setAnalyticsError(errMsg(err));
 } finally {
 if (seq === analyticsReqRef.current) setAnalyticsLoading(false);
 }
 }, [analyticsLoading]);

 const handleTabChange = useCallback(
 (v: string) => {
 setLocalTab(v);
 onTabChange?.(v);
 if (v === "analytics") void loadAnalytics();
 },
 [loadAnalytics, onTabChange]
 );

 // Deep-link support: landing directly on ?tab=analytics (no tab-change
 // event fires) must trigger the same lazy fetch exactly once.
 useEffect(() => {
 if (activeTab === "analytics" && !analytics && !analyticsLoading && !analyticsError) {
 void loadAnalytics();
 }
 }, [activeTab, analytics, analyticsLoading, analyticsError, loadAnalytics]);

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
 `/api/admin/university?id=${encodeURIComponent(id)}`
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
 if (password.length < 8) {
 toast({
 title: "Weak password",
 description: "Password must be at least 8 characters.",
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
 // Plan limits accept -1 = Unlimited (server contract) — anything
 // below that is a typo, not a limit.
 if (
 numOr(d.maxDepartments, -1) < -1 ||
 numOr(d.maxStudents, -1) < -1 ||
 numOr(d.maxTeachers, -1) < -1
 ) {
 toast({
 title: "Invalid limit",
 description: "Limits must be -1 (Unlimited) or a non-negative number.",
 variant: "destructive",
 });
 return;
 }
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

 /* Plan create — the server derives the slug from the name and 409s on
 duplicates, so the form only asks for the human fields. */
 async function createPlan() {
 if (!planForm.name.trim()) {
 toast({
 title: "Plan name is required",
 variant: "destructive",
 });
 return;
 }
 if (
 numOr(planForm.maxDepartments, -1) < -1 ||
 numOr(planForm.maxStudents, -1) < -1 ||
 numOr(planForm.maxTeachers, -1) < -1
 ) {
 toast({
 title: "Invalid limit",
 description: "Limits must be -1 (Unlimited) or a non-negative number.",
 variant: "destructive",
 });
 return;
 }
 setCreatingPlan(true);
 try {
 await apiPost("/api/admin/plans", {
 name: planForm.name.trim(),
 tagline: planForm.tagline.trim() || null,
 priceMonthly: numOr(planForm.priceMonthly, 0),
 priceYearly: numOr(planForm.priceYearly, 0),
 maxDepartments: numOr(planForm.maxDepartments, 1),
 maxStudents: numOr(planForm.maxStudents, 100),
 maxTeachers: numOr(planForm.maxTeachers, 5),
 isActive: true,
 features: planForm.features
 .split(",")
 .map((s) => s.trim())
 .filter(Boolean),
 });
 toast({ title: "Plan created", description: `${planForm.name.trim()} is now selectable for universities.` });
 setPlanDialogOpen(false);
 setPlanForm({ name: "", tagline: "", priceMonthly: "0", priceYearly: "0", maxDepartments: "1", maxStudents: "100", maxTeachers: "5", features: "" });
 await load(true);
 } catch (err) {
 toast({ title: "Could not create plan", description: errMsg(err), variant: "destructive" });
 } finally {
 setCreatingPlan(false);
 }
 }

 async function deletePlan(p: PlanRow) {
 setDeletingPlan(true);
 try {
 await apiDelete(`/api/admin/plans?id=${p.id}`);
 toast({ title: "Plan deleted", description: p.name });
 setPlanDeleteTarget(null);
 await load(true);
 } catch (err) {
 toast({ title: "Could not delete plan", description: errMsg(err), variant: "destructive" });
 } finally {
 setDeletingPlan(false);
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
 <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-4">
 {/* lg+: sidebar rail owns sections; below lg: one pill row */}
 <div className="relative">
 <TabsList className={MOBILE_TABS_LIST}>
 {DASHBOARD_SECTIONS.super_admin.map((s) => (
 <TabsTrigger key={s.value} value={s.value} className="min-h-9 shrink-0 gap-1.5 px-4 text-xs font-medium sm:text-sm">
 <s.icon className="h-3.5 w-3.5" />
 {s.label}
 </TabsTrigger>
 ))}
 </TabsList>
 <div className={MOBILE_TABS_FADE} />
 </div>

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
 <div className="flex items-center gap-2">
 <Badge variant="outline">{plans.length} plans</Badge>
 <Button
 size="sm"
 className="h-8 bg-[#2D4F35] text-white hover:bg-[#3A6B47]"
 onClick={() => setPlanDialogOpen(true)}
 >
 <Plus className="mr-1 h-3.5 w-3.5" />
 Add plan
 </Button>
 </div>
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
 min={-1}
 value={draft.maxDepartments}
 onChange={(e) =>
 patchPlan(p.id, { maxDepartments: e.target.value })
 }
 />
 </Field>
 <Field label="Max students">
 <Input
 type="number"
 min={-1}
 value={draft.maxStudents}
 onChange={(e) =>
 patchPlan(p.id, { maxStudents: e.target.value })
 }
 />
 </Field>
 <Field label="Max teachers">
 <Input
 type="number"
 min={-1}
 value={draft.maxTeachers}
 onChange={(e) =>
 patchPlan(p.id, { maxTeachers: e.target.value })
 }
 />
 </Field>
 </div>
 <p className="-mt-1 text-[10px] text-muted-foreground">
 Tip: -1 means Unlimited — the summary above renders it live.
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

 <div className="mt-auto grid grid-cols-[1fr_auto] gap-2 pt-3">
 <Button
 className={cn(GRADIENT_BTN, "h-10")}
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
 <Button
 variant="outline"
 className="h-10 border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/40"
 aria-label={`Delete ${p.name}`}
 disabled={deletingPlan}
 onClick={() => setPlanDeleteTarget(p)}
 >
 <Trash2 className="h-4 w-4" />
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
 ) : analyticsError && !analytics ? (
 <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-200 bg-rose-50/60 p-10 text-center dark:border-rose-900/60 dark:bg-rose-950/20">
 <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950/50">
 <TriangleAlert className="h-6 w-6 text-rose-600 dark:text-rose-300" />
 </div>
 <p className="text-sm font-bold text-rose-800 dark:text-rose-200">Couldn&apos;t load platform analytics</p>
 <p className="max-w-sm text-xs text-rose-700/90 dark:text-rose-300/80">{analyticsError}</p>
 <Button variant="outline" size="sm" className="mt-1" onClick={() => void loadAnalytics()}>
 <RefreshCw className="h-3.5 w-3.5" />
 Retry
 </Button>
 </div>
 ) : !analytics ? (
 <EmptyState
 icon={ChartNoAxesColumn}
 title="Analytics unavailable"
 hint="Open the Analytics tab to load platform insights."
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
 {analytics.perUniversity.length === 0 ? (
 <tr>
 <td colSpan={5}>
 <EmptyState
 icon={Building2}
 title="No university data yet"
 hint="Register universities and assign plans to populate the leaderboard."
 />
 </td>
 </tr>
 ) : (
 analytics.perUniversity.map((u) => (
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
 ))
 )}
 </tbody>
 </table>
 </div>
 </SectionCard>
 </>
 )}
 </TabsContent>

 {/* ===== Platform Users tab ===== */}
 <TabsContent value="users" className="space-y-4">
 <SuperAdminUsersCard
 universities={universities.map((u) => ({
 id: u.id,
 name: u.name,
 shortName: u.shortName,
 }))}
 />
 </TabsContent>

 {/* ===== System Control tab ===== */}
 <TabsContent value="system" className="space-y-4">
 <SuperAdminSystemCard />
 </TabsContent>
 </Tabs>

 {/* ---------- add plan dialog ---------- */}
 <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
 <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
 <DialogHeader>
 <DialogTitle>Add subscription plan</DialogTitle>
 <DialogDescription>
 The plan appears on the public pricing page immediately. Limits accept -1 for unlimited.
 </DialogDescription>
 </DialogHeader>
 <div className="grid gap-3 py-1">
 <div className="space-y-1.5">
 <Label htmlFor="plan-name">Plan name</Label>
 <Input
 id="plan-name"
 value={planForm.name}
 onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
 placeholder="e.g. Premium Plus"
 maxLength={60}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="plan-tagline">Tagline</Label>
 <Input
 id="plan-tagline"
 value={planForm.tagline}
 onChange={(e) => setPlanForm((f) => ({ ...f, tagline: e.target.value }))}
 placeholder="e.g. For large universities"
 maxLength={200}
 />
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="plan-mo">Monthly price (৳)</Label>
 <Input
 id="plan-mo"
 type="number"
 min="0"
 value={planForm.priceMonthly}
 onChange={(e) => setPlanForm((f) => ({ ...f, priceMonthly: e.target.value }))}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="plan-yr">Yearly price (৳)</Label>
 <Input
 id="plan-yr"
 type="number"
 min="0"
 value={planForm.priceYearly}
 onChange={(e) => setPlanForm((f) => ({ ...f, priceYearly: e.target.value }))}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="plan-dept">Max departments</Label>
 <Input
 id="plan-dept"
 type="number"
 min="-1"
 value={planForm.maxDepartments}
 onChange={(e) => setPlanForm((f) => ({ ...f, maxDepartments: e.target.value }))}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="plan-stu">Max students</Label>
 <Input
 id="plan-stu"
 type="number"
 min="-1"
 value={planForm.maxStudents}
 onChange={(e) => setPlanForm((f) => ({ ...f, maxStudents: e.target.value }))}
 />
 </div>
 <div className="space-y-1.5 sm:col-span-2">
 <Label htmlFor="plan-tea">Max teachers</Label>
 <Input
 id="plan-tea"
 type="number"
 min="-1"
 value={planForm.maxTeachers}
 onChange={(e) => setPlanForm((f) => ({ ...f, maxTeachers: e.target.value }))}
 />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="plan-feat">Features (comma separated)</Label>
 <Textarea
 id="plan-feat"
 value={planForm.features}
 onChange={(e) => setPlanForm((f) => ({ ...f, features: e.target.value }))}
 placeholder="Unlimited routines, QR attendance, Analytics"
 rows={2}
 />
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setPlanDialogOpen(false)} disabled={creatingPlan}>
 Cancel
 </Button>
 <Button
 className="bg-[#2D4F35] text-white hover:bg-[#3A6B47]"
 disabled={creatingPlan || !planForm.name.trim()}
 onClick={() => void createPlan()}
 >
 {creatingPlan && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
 Create plan
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* ---------- delete plan confirm ---------- */}
 <AlertDialog open={planDeleteTarget !== null} onOpenChange={(o) => { if (!o) setPlanDeleteTarget(null); }}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>Delete “{planDeleteTarget?.name}”?</AlertDialogTitle>
 <AlertDialogDescription>
 Universities still subscribed to this plan block the deletion — move them first. This
 permanently removes the plan from pricing.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel disabled={deletingPlan}>Cancel</AlertDialogCancel>
 <AlertDialogAction
 className="bg-rose-600 text-white hover:bg-rose-700"
 disabled={deletingPlan}
 onClick={(e) => {
 e.preventDefault();
 if (planDeleteTarget) void deletePlan(planDeleteTarget);
 }}
 >
 {deletingPlan && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
 Delete plan
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

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
 placeholder="At least 8 characters"
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
