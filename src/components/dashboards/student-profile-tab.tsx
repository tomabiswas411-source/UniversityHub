"use client";

/**
 * StudentProfileTab — the student's account, people and how-to hub.
 *
 * 1. My Profile        — identity card (roll, ID, program, contacts, status)
 * 2. My Courses        — this semester's courses with credit hours
 * 3. My Teachers       — who teaches what, with contact details
 * 4. How attendance works — scan QR, statuses, the 75% exam rule
 *
 * All data comes from /api/student/dashboard (already loaded by the
 * panel) — ZERO extra server requests for this tab.
 */

import {
  BookOpen,
  GraduationCap,
  Info,
  Mail,
  MapPin,
  Phone,
  QrCode,
  ScanLine,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/format";
import { parseDateOnly } from "@/lib/date-bd";
import { EmptyState, SectionCard } from "@/components/dashboards/dashboard-shared";

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
    memberSince: string;
    accountActive: boolean;
  };
  teachers: StudentTeacher[];
  courses: StudentCourse[];
}) {
  const totalCredits = courses.reduce((sum, c) => sum + (c.creditHours ?? 0), 0);
  const memberSince = parseDateOnly(profile.memberSince.slice(0, 10)).toLocaleDateString(
    "en-US",
    { day: "numeric", month: "long", year: "numeric" }
  );

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-2">
      {/* ---------- Identity card ---------- */}
      <SectionCard title="My Profile" icon={UserRound}>
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-xl font-extrabold text-white shadow-lg shadow-[#2D4F35]/25">
            {initials(profile.fullName)}
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
          <InfoRow label="My Phone" value={profile.phone ?? ""} />
          <InfoRow label="Guardian Phone" value={profile.guardianPhone ?? ""} />
          <InfoRow label="Member Since" value={memberSince} />
        </div>
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          To correct your name, phone or guardian contact, contact your department office —
          students cannot edit academic records themselves.
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
