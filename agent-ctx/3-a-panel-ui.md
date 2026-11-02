# Task 3-a — Dashboard UI Panels (Super Admin + Dept Admin)

**Agent:** 3-a (panel-ui)
**Date:** build session
**Status:** ✅ Complete — 0 TypeScript errors in both files (verified with scoped `tsc` program check; other project errors are pre-existing, untouched).

## Files created (only these two were touched)

1. `src/components/dashboards/super-admin-panel.tsx` — `export function SuperAdminPanel()`
2. `src/components/dashboards/dept-admin-panel.tsx` — `export function DeptAdminPanel()`

## super-admin-panel.tsx (≈1,000 lines)

- Header banner: violet→fuchsia→violet gradient strip, "System Control Center", platform eyebrow, Super Admin badge (ShieldCheck), greeting from `useAuthStore().user.fullName`.
- Stats row (StatCard): Universities [amber, sub: active count], Departments [violet], Teachers [fuchsia], Students [emerald], Active Routines [rose, sub: totalUsers].
- Tabs `Universities | Plans & Billing` (TabsList overflow-x-auto).
- Universities tab: SectionCard grid of university cards (active emerald/rose dot, shortName + plan + dept/user count badges, slug). DropdownMenu per card: Edit / View Departments / Deactivate-Activate. "Add University" gradient button.
  - **4 dialogs:** Add University (slug auto-suggested from name until manually touched), Edit University (adds `isActive` Switch + plan Select), Deactivate/Activate AlertDialog (deactivate → `DELETE /api/admin/universities?id=` soft delete; activate → `PUT ... {isActive:true}`), Delete-Department AlertDialog (`DELETE /api/department?id=` hard delete).
  - Add/Edit Department dialog (name*, shortName, code, building, contacts, description) via `POST/PUT /api/department`; detail loaded from `GET /api/admin/university?id=` and shown expanded inline in the card (`max-h-96 overflow-y-auto`, dept count chips render only the `_count` fields the server actually returns: teachers/students/users/schedules).
- Plans tab: per-plan editable cards — tagline, priceMonthly/priceYearly (৳), 3 limit fields (`-1 = Unlimited` hint, summary line renders "Unlimited"), features comma-separated input → `string[]` on save, isActive Switch, per-card Save button with Loader2 (`PUT /api/admin/plans?id=`).
- **Field adaptations:** `PlanDTO.features` arrives as a JSON string → local `parseFeatures()` handles string | array | CSV fallback (`type PlanRow = Omit<PlanDTO,"features"> & { features: unknown }`); `UniversityRow`/`DetailDept` `_count` made optional; `stats.totalUsers` typed via `SuperStats extends PlatformStatsDTO` and defensively guarded.

## dept-admin-panel.tsx (≈1,900 lines)

- Header strip: department + university names from session user, "Department Control Panel", Department Head badge. No `departmentId` → EmptyState.
- Data: single `GET /api/manage/overview?departmentId=` + `GET /api/manage/stats?departmentId=`; all CRUD passes `?departmentId=` for safety via generic `saveEntity<T>(entity, payload, id, labels)` helper over `/api/manage/{entity}`.
- Stats row: Teachers [violet], Students [fuchsia], Courses [amber], Today's Classes [emerald].
- 8 scrollable tabs: Overview | Schedule | Teachers | Students | Courses | Programs | Rooms & Slots | Notices.
  - **Overview:** TimetableGrid preview, Quick Counts (6 mini cards), Pinned Notices list.
  - **Schedule:** full TimetableGrid, All-Classes list (day chip + delete AlertDialog + Edit day/slot dialog). Add-Class dialog: Program → semester input → course options auto-filtered by program+semester (disabled until program picked, inline hint when no match), Teacher, Day, Time slot, Room. 409 conflict errors surface the server message via destructive toast.
  - **Teachers:** searchable (name/email/designation), gradient-initial avatar, designation/email/phone/office lines, active dot; Add/Edit dialog with optional password reset on edit; Delete.
  - **Students:** searchable (name/roll/ID/section), program chip via nested `program.shortName` (`programShortOf()` reads `s.program?.shortName ?? s.programName ?? ""` — no `any`), roll/ID line, Sem/Sec badges; Add/Edit/Delete.
  - **Courses:** card grid (code mono badge, name, program, sem, theory/lab badge, credits); Add/Edit (program select + semester + creditHours + type) / Delete.
  - **Programs:** cards with shortName badge + semesterCount; Add/Edit/Delete.
  - **Rooms & Slots:** two SectionCards — rooms (roomNumber, building, type badge, capacity) and slots ordered by `slotOrder` with amber-highlighted breaks; Add/Edit/Delete both.
  - **Notices:** sorted pinned-first then newest, local NoticeCategoryBadge + AudienceBadge + `timeAgo` (imported from `@/components/shared/notification-bell`), Add Notice dialog (title, content textarea, category, audience, optional program/semester, isPinned switch), Delete confirm.
- **9 form dialogs + 1 shared ConfirmDialog** (17 mounted dialog instances total): TeacherDialog, StudentDialog, CourseDialog, ProgramDialog, RoomDialog, SlotDialog, NoticeDialog (add), AddScheduleDialog, EditScheduleDialog, ConfirmDialog (loading spinner via `preventDefault` on AlertDialogAction so async delete keeps the dialog open).

## Conventions honored

Aurora Royale palette only (violet/fuchsia/amber/emerald/rose — no indigo/blue/teal), GRADIENT_BTN/GRADIENT_ICON from dashboard-shared, framer-motion fade/slide entrances, `rounded-2xl border bg-card` cards, `max-h-96 overflow-y-auto` long lists, h-10 touch targets (sm:h-9 compaction), shadcn/ui only, `toast({ title, description, variant })`, no `any`, no console.log, ESLint-clean (verified no unused imports/symbols).
