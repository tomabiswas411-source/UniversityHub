"use client";

/**
 * SuperAdminUsersCard — platform-wide user directory + control.
 *
 * The missing "control the whole platform" piece for the global admin:
 * every account on every university in ONE table, with filters and the
 * full action set — activate/deactivate, change role, reset password.
 * Guards live server-side too (super_admin rows untouchable, no
 * self-lockout).
 *
 * COST GUARD: one GET per filter change (take 500), one PUT per action.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyRound,
  Loader2,
  MoreVertical,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  UserCog,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiGet, apiPut } from "@/lib/api-client";
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
import { EmptyState, SectionCard } from "@/components/dashboards/dashboard-shared";

interface DirectoryUser {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  isActive: boolean;
  studentIdNumber: string | null;
  rollNumber: string | null;
  semester: number | null;
  designation: string | null;
  createdAt: string;
  university: { id: string; name: string; shortName: string | null; slug: string } | null;
  department: { id: string; name: string; shortName: string } | null;
}

export interface UniOption {
  id: string;
  name: string;
  shortName: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  dept_admin: "Dept Head",
  teacher: "Teacher",
  student: "Student",
};
const ROLE_CLS: Record<string, string> = {
  super_admin: "bg-[#241C15] text-[#FFE01B]",
  dept_admin: "bg-green/10 text-green",
  teacher: "bg-navy/10 text-navy dark:text-[#9DB4D6]",
  student: "bg-gold/25 text-[#7A6500] dark:text-gold",
};

export function SuperAdminUsersCard({ universities }: { universities: UniOption[] }) {
  const [users, setUsers] = useState<DirectoryUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  /* Load failure — kept separate from "no users match" so a broken
     request never renders the misleading empty state below. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [role, setRole] = useState("all");
  const [universityId, setUniversityId] = useState("all");
  const [active, setActive] = useState("all");
  const [q, setQ] = useState("");
  // Pagination — the API serves one page (default 100 rows) plus a real
  // total, so a directory larger than one page stays reachable.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const reqSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (role !== "all") qs.set("role", role);
      if (universityId !== "all") qs.set("universityId", universityId);
      if (active !== "all") qs.set("active", active);
      if (q.trim()) qs.set("q", q.trim());
      qs.set("page", String(page));
      const d = await apiGet<{
        users: DirectoryUser[];
        total?: number;
        page?: number;
        pages?: number;
      }>(`/api/admin/users?${qs.toString()}`);
      if (seq !== reqSeq.current) return;
      setUsers(d.users);
      setTotal(d.total ?? d.users.length);
      setPages(d.pages ?? 1);
      setLoadError(null);
    } catch (err) {
      if (seq !== reqSeq.current) return;
      // users stays null — the render shows a retryable error card
      // instead of the misleading "No users match these filters".
      setUsers(null);
      setLoadError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [role, universityId, active, q, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 350 : 0); // debounce search
    return () => clearTimeout(t);
  }, [load, q]);

  /* ---------- actions ---------- */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<DirectoryUser | null>(null);
  const [pwTarget, setPwTarget] = useState<DirectoryUser | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwShow, setPwShow] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [roleTarget, setRoleTarget] = useState<DirectoryUser | null>(null);
  const [roleValue, setRoleValue] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);
  // Optional student identity — converting staff → student needs ID + Roll
  // for the student login to work (the server rejects the change without
  // them unless the account already carries both).
  const [roleSid, setRoleSid] = useState("");
  const [roleRoll, setRoleRoll] = useState("");

  const patchUser = useCallback(
    async (u: DirectoryUser, patch: Record<string, unknown>, okMsg: string): Promise<boolean> => {
      setBusyId(u.id);
      try {
        await apiPut(`/api/admin/users?id=${encodeURIComponent(u.id)}`, patch);
        toast({ title: okMsg, description: u.fullName });
        void load();
        return true;
      } catch (err) {
        toast({
          title: "Action failed",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  /* Deactivation is destructive (instant lockout) — routed through an
     AlertDialog instead of firing straight from the dropdown. The dialog
     only closes on SUCCESS: a failed PATCH used to close it and leave the
     row unchanged with no retry affordance. */
  const confirmDeactivate = useCallback(async () => {
    if (!deactivateTarget) return;
    const target = deactivateTarget;
    const ok = await patchUser(target, { isActive: false }, "Account deactivated");
    if (ok) setDeactivateTarget(null);
  }, [deactivateTarget, patchUser]);
  const deactivating = deactivateTarget !== null && busyId === deactivateTarget.id;

  const submitPassword = useCallback(async () => {
    if (!pwTarget) return;
    if (pwValue.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setPwSaving(true);
    try {
      await apiPut(`/api/admin/users?id=${encodeURIComponent(pwTarget.id)}`, { password: pwValue });
      toast({ title: "Password reset", description: pwTarget.fullName });
      setPwTarget(null);
      setPwValue("");
    } catch (err) {
      toast({
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPwSaving(false);
    }
  }, [pwTarget, pwValue]);

  const submitRole = useCallback(async () => {
    if (!roleTarget) return;
    setRoleSaving(true);
    try {
      const payload: Record<string, unknown> = { role: roleValue };
      if (roleValue === "student") {
        payload.studentIdNumber = roleSid.trim();
        payload.rollNumber = roleRoll.trim();
      }
      await apiPut(`/api/admin/users?id=${encodeURIComponent(roleTarget.id)}`, payload);
      toast({ title: "Role updated", description: `${roleTarget.fullName} → ${ROLE_LABEL[roleValue] ?? roleValue}` });
      setRoleTarget(null);
      void load();
    } catch (err) {
      toast({
        title: "Role change failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRoleSaving(false);
    }
  }, [roleTarget, roleValue, roleSid, roleRoll, load]);

  const stats = useMemo(() => {
    if (!users) return null;
    return {
      total: users.length,
      active: users.filter((u) => u.isActive).length,
      staff: users.filter((u) => u.role === "dept_admin" || u.role === "teacher").length,
    };
  }, [users]);

  return (
    <SectionCard
      title="Platform Users"
      icon={ShieldCheck}
      action={
        stats ? (
          <span className="hidden items-center gap-1.5 text-[11px] font-semibold text-muted-foreground sm:flex">
            <Badge variant="outline">{total} users total</Badge>
            <Badge variant="outline" className="text-green">{stats.active} active here</Badge>
          </span>
        ) : undefined
      }
    >
      {/* filters */}
      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
        <div className="relative col-span-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, email, roll, ID…"
            aria-label="Search users"
            className="pl-8"
          />
        </div>
        <Select
          value={role}
          onValueChange={(v) => {
            setRole(v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Filter by role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="dept_admin">Department Heads</SelectItem>
            <SelectItem value="teacher">Teachers</SelectItem>
            <SelectItem value="student">Students</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={universityId}
          onValueChange={(v) => {
            setUniversityId(v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Filter by university" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All universities</SelectItem>
            {universities.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.shortName || u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* GET /api/admin/users supports ?active=true|false (absent = all). */}
        <Select
          value={active}
          onValueChange={(v) => {
            setActive(v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Filter by account status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="true">Active only</SelectItem>
            <SelectItem value="false">Inactive only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* list */}
      {loading && !users ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
        </div>
      ) : loadError && !users ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-200 bg-rose-50/60 p-8 text-center dark:border-rose-900/60 dark:bg-rose-950/20">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950/50">
            <TriangleAlert className="h-5 w-5 text-rose-600 dark:text-rose-300" />
          </div>
          <p className="text-sm font-bold text-rose-800 dark:text-rose-200">Couldn&apos;t load users</p>
          <p className="max-w-sm text-xs text-rose-700/90 dark:text-rose-300/80">{loadError}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-1"
            onClick={() => void load()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      ) : !users || users.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No users match these filters"
          hint="Try clearing the search or choosing another role or university."
        />
      ) : (
        <div className="max-h-[560px] overflow-auto rounded-xl border [scrollbar-width:thin]">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/95 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground backdrop-blur">
                <th className="px-3 py-2.5">User</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">University / Dept</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t transition-colors hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    <p className="max-w-[200px] truncate font-semibold">{u.fullName}</p>
                    <p className="max-w-[200px] truncate text-[11px] text-muted-foreground">
                      {u.role === "student"
                        ? `ID ${u.studentIdNumber ?? "—"} · Roll ${u.rollNumber ?? "—"}`
                        : u.email ?? "—"}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold",
                        ROLE_CLS[u.role] ?? "bg-muted"
                      )}
                    >
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="max-w-[180px] truncate text-xs font-medium">
                      {u.university?.shortName || u.university?.name || "Platform"}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {u.department?.shortName ?? u.department?.name ?? "—"}
                      {u.role === "student" && u.semester ? ` · Sem ${u.semester}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-[11px] font-semibold",
                        u.isActive ? "text-green" : "text-rose-600 dark:text-rose-400"
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          u.isActive ? "bg-emerald-500" : "bg-rose-500"
                        )}
                      />
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {u.role === "super_admin" ? (
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        Protected
                      </span>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${u.fullName}`}
                            className="h-8 w-8 rounded-lg"
                            disabled={busyId === u.id}
                          >
                            {busyId === u.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreVertical className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem
                            onClick={() => {
                              if (u.isActive) {
                                // Deactivate needs confirmation; activation is safe.
                                setDeactivateTarget(u);
                              } else {
                                void patchUser(u, { isActive: true }, "Account activated");
                              }
                            }}
                          >
                            <Power className="h-4 w-4" />
                            {u.isActive ? "Deactivate account" : "Activate account"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setRoleTarget(u);
                              setRoleValue(u.role);
                              setRoleSid("");
                              setRoleRoll("");
                            }}
                          >
                            <UserCog className="h-4 w-4" />
                            Change role
                          </DropdownMenuItem>
                          {u.role !== "student" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setPwTarget(u);
                                  setPwValue("");
                                }}
                              >
                                <KeyRound className="h-4 w-4" />
                                Reset password
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* pagination — the directory is served in pages; sweep with Prev/Next */}
      {users !== null && pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page} of {pages} · {total} users total
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages || loading}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* deactivate confirmation — destructive, not undoable from the row */}
      <AlertDialog open={deactivateTarget !== null} onOpenChange={(o) => { if (!o) setDeactivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this account?</AlertDialogTitle>
            <AlertDialogDescription>
              The user will immediately lose access. You can reactivate later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={deactivating}
              onClick={(e) => {
                e.preventDefault();
                void confirmDeactivate();
              }}
            >
              {deactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* reset password dialog */}
      <Dialog open={!!pwTarget} onOpenChange={(o) => !o && setPwTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for <span className="font-semibold">{pwTarget?.fullName}</span>. Share it
              with them privately — they can change it after logging in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="sa-new-pw">New password</Label>
            {/* masked by default — the old plaintext input leaked on
                shoulder-surf / screen-share; toggle only reveals on demand */}
            <div className="relative">
              <Input
                id="sa-new-pw"
                type={pwShow ? "text" : "password"}
                value={pwValue}
                onChange={(e) => setPwValue(e.target.value)}
                placeholder="At least 8 characters"
                className="pr-10"
                autoFocus
              />
              <button
                type="button"
                aria-label={pwShow ? "Hide password" : "Show password"}
                onClick={() => setPwShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                {pwShow ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwTarget(null)}>
              Cancel
            </Button>
            <Button className="bg-[#2D4F35] text-white hover:bg-[#3A6B47]" onClick={() => void submitPassword()} disabled={pwSaving}>
              {pwSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* change role dialog */}
      <Dialog open={!!roleTarget} onOpenChange={(o) => !o && setRoleTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              <span className="font-semibold">{roleTarget?.fullName}</span> — pick the new role. Students
              log in with ID + Roll; staff log in with email + password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={roleValue} onValueChange={setRoleValue}>
              <SelectTrigger aria-label="New role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="dept_admin">Department Head</SelectItem>
              </SelectContent>
            </Select>
            {roleValue === "student" && (
              <div className="space-y-1.5 pt-2">
                <Label htmlFor="sa-role-sid">Student ID Number (optional)</Label>
                <Input
                  id="sa-role-sid"
                  value={roleSid}
                  onChange={(e) => setRoleSid(e.target.value)}
                  placeholder={roleTarget?.studentIdNumber || "e.g. 2023-ICE-045"}
                />
                <Label htmlFor="sa-role-roll">Roll Number (optional)</Label>
                <Input
                  id="sa-role-roll"
                  value={roleRoll}
                  onChange={(e) => setRoleRoll(e.target.value)}
                  placeholder={roleTarget?.rollNumber || "e.g. 2301045"}
                />
                <p className="text-[11px] text-muted-foreground">
                  Students sign in with ID + Roll — fill these in when converting
                  a staff account, or leave blank to keep existing values.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-[#2D4F35] text-white hover:bg-[#3A6B47]"
              onClick={() => void submitRole()}
              disabled={roleSaving || !roleTarget || roleValue === roleTarget.role}
            >
              {roleSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Update role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
