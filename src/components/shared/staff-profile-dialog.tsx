"use client";

/**
 * StaffProfileDialog — self-service account facility for STAFF roles
 * (teacher / dept_admin) reached from the header Account menu.
 *
 * Until now a teacher could not even edit their own phone number —
 * only an admin reset existed. This dialog closes that gap with two
 * blocks:
 *
 * 1. Account   — read-only academic identity (name, designation, email,
 *                department). Office-controlled by design: self-editing
 *                these would break rosters, login emails and faculty cards.
 * 2. Contact   — editable whitelist (phone / office room / bio) that maps
 *                1:1 onto PUT /api/teacher/profile (which rejects anything
 *                outside the whitelist server-side).
 * 3. Security  — self-service password rotation. The CURRENT password is
 *                required, so a stolen session alone cannot take over the
 *                credential.
 */

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Building2,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiPost, apiPut } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { ROLE_LABELS } from "@/lib/role-labels";
import { initials } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

function IdentityRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border/60 py-2 last:border-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold">{value || "—"}</span>
    </div>
  );
}

export function StaffProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const refresh = useAuthStore((s) => s.refresh);

  /* ---------- contact form ---------- */
  const [phone, setPhone] = useState("");
  const [officeRoom, setOfficeRoom] = useState("");
  const [bio, setBio] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);

  /* ---------- password form ---------- */
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  /* Seed the form from the session user each time the dialog opens —
     reopening after a save (or by another staff account) must not show
     stale text from the previous mount. */
  useEffect(() => {
    if (open && user) {
      setPhone(user.phone ?? "");
      setOfficeRoom(user.officeRoom ?? "");
      setBio(user.bio ?? "");
      setProfileDirty(false);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    }
  }, [open, user]);

  const isStaff = user?.role === "teacher" || user?.role === "dept_admin";

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!isStaff) return;
    setSavingProfile(true);
    try {
      await apiPut("/api/teacher/profile", {
        phone,
        officeRoom,
        bio,
      });
      await refresh(); // re-sync the session user (header/dialog read it)
      setProfileDirty(false);
      toast({
        title: "Profile updated",
        description: "Your contact details are now visible to your students.",
      });
    } catch (err) {
      toast({
        title: "Couldn't update profile",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!isStaff) return;
    if (newPw.length < 8) {
      toast({
        title: "Password too short",
        description: "Use at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    if (newPw !== confirmPw) {
      toast({
        title: "Passwords don't match",
        description: "Re-enter the new password in both fields.",
        variant: "destructive",
      });
      return;
    }
    setSavingPw(true);
    try {
      await apiPost("/api/teacher/change-password", {
        currentPassword: currentPw,
        newPassword: newPw,
      });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      toast({
        title: "Password changed",
        description: "Use the new password the next time you sign in.",
      });
    } catch (err) {
      toast({
        title: "Couldn't change password",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="h-4.5 w-4.5 text-green" aria-hidden />
            My Profile
          </DialogTitle>
          <DialogDescription>
            Keep your contact details current — students and colleagues see them on faculty cards.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <>
            {/* ---------- Account (read-only identity) ---------- */}
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-base font-extrabold text-white shadow-md shadow-[#2D4F35]/25">
                {initials(user.fullName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold leading-tight">{user.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {ROLE_LABELS[user.role] ?? user.role}
                  {user.departmentName ? ` · ${user.departmentName}` : ""}
                </p>
              </div>
            </div>
            <div className="mt-1">
              <IdentityRow
                icon={<BadgeCheck className="h-3.5 w-3.5" aria-hidden />}
                label="Designation"
                value={user.designation ?? ""}
              />
              <IdentityRow
                icon={<Mail className="h-3.5 w-3.5" aria-hidden />}
                label="Email"
                value={user.email ?? ""}
              />
              <IdentityRow
                icon={<Building2 className="h-3.5 w-3.5" aria-hidden />}
                label="Department"
                value={user.departmentName ?? ""}
              />
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Name, designation and email are managed by your department office.
            </p>

            <Separator />

            {/* ---------- Contact (editable) ---------- */}
            <form onSubmit={saveProfile} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sp-phone" className="text-xs font-semibold">
                  <Phone className="mr-1 inline h-3 w-3" aria-hidden />
                  Phone
                </Label>
                <Input
                  id="sp-phone"
                  value={phone}
                  maxLength={30}
                  placeholder="e.g. +8801XXXXXXXXX"
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setProfileDirty(true);
                  }}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp-office" className="text-xs font-semibold">
                  <Building2 className="mr-1 inline h-3 w-3" aria-hidden />
                  Office room
                </Label>
                <Input
                  id="sp-office"
                  value={officeRoom}
                  maxLength={40}
                  placeholder="e.g. ICE-401"
                  onChange={(e) => {
                    setOfficeRoom(e.target.value);
                    setProfileDirty(true);
                  }}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp-bio" className="text-xs font-semibold">
                  Short bio
                </Label>
                <Textarea
                  id="sp-bio"
                  value={bio}
                  maxLength={500}
                  rows={3}
                  placeholder="One or two lines students will see about you"
                  onChange={(e) => {
                    setBio(e.target.value);
                    setProfileDirty(true);
                  }}
                  className="min-h-16 resize-none text-sm"
                />
                <p className="text-[10px] text-muted-foreground">{bio.length}/500</p>
              </div>
              <Button type="submit" disabled={savingProfile} className="h-9 w-full">
                {savingProfile ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                {savingProfile ? "Saving…" : "Save contact details"}
              </Button>
            </form>

            <Separator />

            {/* ---------- Security (password rotation) ---------- */}
            <form onSubmit={changePassword} className="space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-green" aria-hidden />
                Change password
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="sp-cur" className="text-xs font-semibold">
                  Current password
                </Label>
                <Input
                  id="sp-cur"
                  type="password"
                  autoComplete="current-password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  className="h-9"
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sp-new" className="text-xs font-semibold">
                    New password
                  </Label>
                  <Input
                    id="sp-new"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    className="h-9"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sp-conf" className="text-xs font-semibold">
                    Confirm new
                  </Label>
                  <Input
                    id="sp-conf"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    className="h-9"
                    required
                  />
                </div>
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                8–72 characters. You stay signed in — the new password applies from the next login.
              </p>
              <Button type="submit" disabled={savingPw} className="h-9 w-full">
                {savingPw ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-1.5 h-4 w-4" />
                )}
                {savingPw ? "Updating…" : "Change password"}
              </Button>
            </form>
            {profileDirty && (
              <p className="text-center text-[10px] text-amber-600 dark:text-amber-400">
                You have unsaved contact changes — press “Save contact details” before closing.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
