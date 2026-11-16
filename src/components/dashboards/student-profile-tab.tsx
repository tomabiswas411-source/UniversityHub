"use client";

import { useCallback, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  GraduationCap,
  Info,
  Mail,
  MapPin,
  Pencil,
  Phone,
  QrCode,
  ScanLine,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPatch } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import { initials } from "@/lib/format";
import { parseDateOnly } from "@/lib/date-bd";
import { EmptyState, SectionCard } from "@/components/dashboards/dashboard-shared";
import { cn } from "@/lib/utils";

export interface StudentTeacher {
  id: string;
  fullName: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  officeRoom: string | null;
  courses: string[];
}

export interface StudentCourse {
  id: string;
  code: string;
  name: string;
  creditHours: number;
  type: string;
  semester: number;
}

/* ---------------- Phase 2 (D27): photo resize ---------------- */
const PHOTO_MAX_BYTES = 150 * 1024; // 150 KB — mirrors the server guard

/** Client-side canvas resize: square-crop to 256px JPEG. Iteratively
    lowers quality until the data URL fits the server's 150 KB cap. */
async function resizePhotoToDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    throw new Error("Photo must be a PNG, JPEG or WebP image");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Photo is too large (max 10 MB original)");
  }
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the image");
  // Square center-crop
  const side = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size
  );
  bitmap.close();
  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length * 0.75 > PHOTO_MAX_BYTES && quality > 0.4) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length * 0.75 > PHOTO_MAX_BYTES) {
    throw new Error("Photo is too large after compression — try a simpler image");
  }
  return dataUrl;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm font-semibold">{value || "—"}</span>
    </div>
  );
}

export function StudentProfileTab({
  profile,
  teachers,
  courses,
  onChanged,
}: {
  profile: {
    fullName: string;
    rollNumber: string | null;
    studentIdNumber: string | null;
    semester: number | null;
    section: string | null;
    departmentName: string | null;
    universityName: string | null;
    programName: string | null;
    phone: string | null;
    guardianPhone: string | null;
    photoURL?: string | null;
    memberSince: string;
    accountActive: boolean;
  };
  teachers: StudentTeacher[];
  courses: StudentCourse[];
  /** Called after a successful profile save — the panel reloads so the
      API stays the source of truth. */
  onChanged?: () => void;
}) {
  const totalCredits = courses.reduce((sum, c) => sum + (c.creditHours ?? 0), 0);
  const memberSince = parseDateOnly(profile.memberSince.slice(0, 10)).toLocaleDateString(
    "en-US",
    { day: "numeric", month: "long", year: "numeric" }
  );

  /* ---- Phase 2 (D27): self-service edit state ---- */
  const [editing, setEditing] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState(profile.phone ?? "");
  const [guardianDraft, setGuardianDraft] = useState(profile.guardianPhone ?? "");
  const [photoDraft, setPhotoDraft] = useState<string | null | undefined>(undefined); // undefined = untouched
  const [saving, setSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const startEdit = useCallback(() => {
    setPhoneDraft(profile.phone ?? "");
    setGuardianDraft(profile.guardianPhone ?? "");
    setPhotoDraft(undefined);
    setEditing(true);
  }, [profile.phone, profile.guardianPhone]);

  const pickPhoto = useCallback(async (file: File | undefined | null) => {
    if (!file) return;
    try {
      const dataUrl = await resizePhotoToDataUrl(file);
      setPhotoDraft(dataUrl);
    } catch (err) {
      toast({
        title: "Photo rejected",
        description: err instanceof Error ? err.message : "Try a different image",
        variant: "destructive",
      });
    }
  }, []);

  const saveProfile = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (phoneDraft !== (profile.phone ?? "")) body.phone = phoneDraft;
      if (guardianDraft !== (profile.guardianPhone ?? "")) body.guardianPhone = guardianDraft;
      if (photoDraft !== undefined) body.photoURL = photoDraft;
      if (Object.keys(body).length === 0) {
        setEditing(false);
        return;
      }
      await apiPatch("/api/student/profile", body);
      toast({ title: "Profile updated" });
      setEditing(false);
      onChanged?.();
    } catch (err) {
      toast({
        title: "Couldn't save profile",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [saving, phoneDraft, guardianDraft, photoDraft, profile.phone, profile.guardianPhone, onChanged]);

  const shownPhoto = photoDraft === undefined ? (profile.photoURL ?? null) : photoDraft;

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-2">
      {/* ---------- Identity card ---------- */}
      <SectionCard
        title="My Profile"
        icon={UserRound}
        action={
          editing ? (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                <X className="mr-1 h-3.5 w-3.5" aria-hidden />
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 rounded-full bg-[#2D4F35] px-3 text-xs text-white hover:bg-[#24402b]"
                onClick={() => void saveProfile()}
                disabled={saving}
              >
                {saving ? "Saving…" : (
                  <>
                    <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Save
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-full px-3 text-xs"
              onClick={startEdit}
              aria-label="Edit contact details and photo"
            >
              <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
              Edit
            </Button>
          )
        }
      >
        <div className="flex items-center gap-4">
          <span className="relative shrink-0">
            {shownPhoto ? (
              <img
                src={shownPhoto}
                alt={`${profile.fullName}'s profile photo`}
                className="h-16 w-16 rounded-2xl object-cover shadow-lg shadow-[#2D4F35]/25"
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-xl font-extrabold text-white shadow-lg shadow-[#2D4F35]/25">
                {initials(profile.fullName)}
              </span>
            )}
            {editing && (
              <>
                <input
                  ref={photoInputRef}
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    void pickPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  aria-label="Change profile photo"
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-[#2D4F35] text-white shadow transition-transform hover:scale-110"
                >
                  <Pencil className="h-3 w-3" aria-hidden />
                </button>
              </>
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold leading-tight">{profile.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {profile.programName ?? "Student"}
              {profile.semester != null ? ` · Semester ${profile.semester}` : ""}
              {profile.section ? ` · Section ${profile.section}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={
                  profile.accountActive
                    ? "border-green/40 bg-green/10 text-green"
                    : "border-rose-400/40 bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                }
              >
                <ShieldCheck className="mr-1 h-3 w-3" aria-hidden />
                {profile.accountActive ? "Active" : "Inactive"}
              </Badge>
              {profile.rollNumber && (
                <Badge variant="secondary" className="font-mono text-[11px]">
                  Roll {profile.rollNumber}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <InfoRow label="Student ID" value={profile.studentIdNumber ?? ""} />
          <InfoRow label="Roll Number" value={profile.rollNumber ?? ""} />
          <InfoRow label="Program" value={profile.programName ?? ""} />
          <InfoRow label="Department" value={profile.departmentName ?? ""} />
          <InfoRow label="University" value={profile.universityName ?? ""} />
          {editing ? (
            <div className="mt-3 space-y-3 rounded-xl border bg-background/60 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="sp-phone">My phone</Label>
                <Input
                  id="sp-phone"
                  type="tel"
                  placeholder="+8801XXXXXXXXX"
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  maxLength={30}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp-guardian">Guardian phone</Label>
                <Input
                  id="sp-guardian"
                  type="tel"
                  placeholder="+8801XXXXXXXXX"
                  value={guardianDraft}
                  onChange={(e) => setGuardianDraft(e.target.value)}
                  maxLength={30}
                  disabled={saving}
                />
              </div>
              {photoDraft !== undefined && (
                <p className="text-xs text-muted-foreground">
                  New photo selected — it will be uploaded when you save.
                </p>
              )}
            </div>
          ) : (
            <>
              <InfoRow label="My Phone" value={profile.phone ?? ""} />
              <InfoRow label="Guardian Phone" value={profile.guardianPhone ?? ""} />
            </>
          )}
          <InfoRow label="Member Since" value={memberSince} />
        </div>
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          You can edit your contact details and photo yourself. Name, roll,
          semester and section changes go through your department office.
        </p>
      </SectionCard>

      {/* ---------- My Courses ---------- */}
      <SectionCard
        title="My Courses"
        icon={BookOpen}
        action={
          courses.length > 0 ? (
            <span className="text-xs font-medium text-muted-foreground">
              {courses.length} course{courses.length === 1 ? "" : "s"}
              {totalCredits > 0 ? ` · ${totalCredits} credits` : ""}
            </span>
          ) : undefined
        }
      >
        {courses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            hint="Courses appear here once your department publishes the routine."
          />
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {courses.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-background/60 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{c.code}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={c.type === "lab" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" : ""}
                  >
                    {c.type === "lab" ? "Lab" : "Theory"}
                  </Badge>
                  <Badge variant="outline" className="w-14 justify-center">
                    {c.creditHours} cr
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ---------- My Teachers ---------- */}
      <SectionCard
        title="My Teachers"
        icon={Users}
        action={
          teachers.length > 0 ? (
            <span className="text-xs font-medium text-muted-foreground">
              Teaching you this semester
            </span>
          ) : undefined
        }
      >
        {teachers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No teachers assigned yet"
            hint="Your course teachers will appear here once the routine is published."
          />
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {teachers.map((t) => (
              <div key={t.id} className="rounded-xl border bg-background/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{t.fullName}</p>
                    {t.designation && (
                      <p className="truncate text-xs text-muted-foreground">{t.designation}</p>
                    )}
                  </div>
                  {t.courses.length > 0 && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {t.courses.join(", ")}
                    </Badge>
                  )}
                </div>
                {(t.email || t.phone || t.officeRoom) && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {t.email && (
                      <a
                        href={`mailto:${t.email}`}
                        className="inline-flex items-center gap-1 hover:text-green hover:underline"
                      >
                        <Mail className="h-3 w-3" aria-hidden />
                        {t.email}
                      </a>
                    )}
                    {t.phone && (
                      <a
                        href={`tel:${t.phone}`}
                        className="inline-flex items-center gap-1 hover:text-green hover:underline"
                      >
                        <Phone className="h-3 w-3" aria-hidden />
                        {t.phone}
                      </a>
                    )}
                    {t.officeRoom && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" aria-hidden />
                        Office {t.officeRoom}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ---------- How attendance works ---------- */}
      <SectionCard title="How attendance works" icon={Info}>
        <ol className="space-y-3">
          <li className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green/10">
              <QrCode className="h-4 w-4 text-green" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">Scan the class QR</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Your teacher shows a QR code in class — open <ScanLine className="inline h-3 w-3" aria-hidden />{" "}
                <strong>Scan</strong> (bottom bar) and point your camera at it. You must be inside the
                classroom — the app checks your distance from the room.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green/10">
              <GraduationCap className="h-4 w-4 text-green" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">One device, one student</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                A device can check in one student per class — scanning for a friend will be rejected.
                Each scan records your distance for audit.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green/10">
              <Info className="h-4 w-4 text-green" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">Status letters</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                <strong>P</strong> present · <strong>L</strong> late (still counts as attended) ·{" "}
                <strong>A</strong> absent · <strong>E</strong> excused (approved leave — excluded
                from your percentage).
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/50">
              <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-300" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">The 75% rule</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Keep every subject at <strong>75% or above</strong> to sit for exams. The Performance
                tab shows per-course percentages, and the Documents tab lets you download your full
                ledger any time.
              </p>
            </div>
          </li>
        </ol>
      </SectionCard>
    </div>
  );
}
