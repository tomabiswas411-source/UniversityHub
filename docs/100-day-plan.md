# UniversityHub — 100-Day Full Platform Development Plan

**Version 1.0** · Baseline commit `f486859` · Grounded in a full code audit of admin/super-admin surfaces (11 logic errors found, capability matrix mapped).

---

## এক নজরে (Executive Summary — Bengali)

এই পরিকল্পনা UniversityHub-কে ১০০ দিনে একটি সম্পূর্ণ, ব্যবহারবান্ধব, ত্রুটিমুক্ত ও উন্নত টুলসমৃদ্ধ মাল্টি-টেন্যান্ট ইউনিভার্সিটি ম্যানেজমেন্ট প্ল্যাটফর্মে রূপান্তরের রোডম্যাপ। ৭টি ধাপ: (১) অ্যাডমিন ও সুপার অ্যাডমিনের সম্পূর্ণ নিয়ন্ত্রণ, (২) শিক্ষার্থীদের সব সুবিধা নিশ্চিত করা, (৩) পুরো প্ল্যাটফর্মে ত্রুটি খুঁজে ঠিক করা, (৪ ও ৬) উন্নত টুলস — বিশ্লেষণ, রিপোর্ট সেন্টার, পুশ নোটিফিকেশন, AI সহায়ক, স্মার্ট রুটিন, বিলিং, (৫) ব্যবহারবান্ধবতা — UX, বাংলা ভাষা, অ্যাক্সেসিবিলিটি, (৭) নিরাপত্তা, স্কেল ও লঞ্চ। প্রতিটি ধাপ ব্রাউজার-যাচাইকৃতভাবে ডেলিভার হবে।

---

## 1. Day-0 Baseline — Where the platform stands today

### 1.1 Already shipped (production-verified)

| Area | Status |
|---|---|
| Multi-tenant auth | University slug + student ID/Roll passwordless login; staff email/password; httpOnly JWT; per-request DB re-verification kills stale tokens |
| Roles | super_admin · dept_admin · teacher · student — role-gated, code-split panels |
| Teacher facility | 22 API actions · 9 tabs · 8 export types · master attendance sheet (teacher+batch+subject aggregation) · self-service profile + password rotation |
| Student facility (partial) | Documents tab (6 self-service CSV exports) · Profile tab · per-course attendance sheet download |
| Dept Admin | 10 tabs: Overview, Analytics, Schedule, Class Changes, Teachers, Students, Courses, Programs, Rooms & Slots, Notices; schedule clash detection; QR kill-switch; attendance watchlist + CSV |
| Super Admin | 5 tabs: Universities (dept CRUD + staff provisioning), Platform Users (activate/reset-password/role change), Plans & Billing CRUD, Analytics (MRR/ARR/growth/usage), System Control (health tiles, retention sweep, QR kill-switch, broadcast) |
| Plan enforcement | maxDepartments/maxTeachers/maxStudents caps on dept-side creates |
| QR attendance | Session supersede + absent sweep; deviceId/distance anti-fraud trail |
| PWA & mobile | Install + notification sounds; mobile-first nav; footer hidden on mobile |
| Ops | Vercel Cron retention sweep (daily 21:00), env-drift guard procedure, Turso + local fallback |

### 1.2 Verified gaps (today's audit — feeds Phase 1 & 3)

**Logic errors found (11):**

1. ✅ FIXED (Day-1 kickoff): `PASSWORD_MIN = 6` in super-admin API while the message claimed 8 — accepted weak 6–7 char passwords. Now 8 everywhere, message templated from the constant.
2. ✅ FIXED (Day-1 kickoff): Dept TeacherDialog client hint said "at least 6" while server requires 8 → guaranteed server rejection. Now aligned to 8.
3. ✅ FIXED (Day-1 kickoff): Super-admin staff provisioning skipped the plan-cap check → cap bypass. Now enforces `maxTeachers` (parity with /api/manage).
4. Plan downgrade / cap reduction never validated against current usage (caps only bite on next create).
5. University PUT skips the email/URL format validation that POST has → invalid contact data can enter on edit.
6. Plan edit does not resync slug or check duplicate names (POST does).
7. `planExpiresAt` column is dead — no subscription expiry enforcement, no auto-suspend of lapsed tenants.
8. Broadcast fan-out silently caps at 2000 users — no error signal on truncation.
9. `requireRole()` helper is dead code; all guards copy-pasted inline, no middleware backstop for future routes.
10. Edge: manage email-uniqueness compares against `null` universityId for corrupted rows instead of failing loudly.
11. UI↔API surface mismatches — server features unreachable from UI (dept-admin batch promotion, results/assignments management, department activate toggle, notice expiry/attachment).

**Missing capabilities:** AuditLog (who-did-what), bulk CSV import, second super-admin creation via UI, super-admin student creation UI, billing/renewal lifecycle.

---

## 2. Guiding Principles

1. **User-friendly first** — every feature ships with empty states, loading skeletons, toasts, mobile layout, and Bengali labels where they matter.
2. **Zero regression** — real data (e.g. the 2026-11-04 attendance sessions) is untouchable; destructive tests only on seeded fixtures; QR sessions never started against live slots.
3. **Realistic increments** — 7 phases × ~14 days; every phase ends production-deployed and browser-verified.
4. **Verification standard** — agent-browser E2E on golden paths + curl guard matrix + dev.log review every session.
5. **Security by default** — least privilege, plan caps, audit logging of every admin mutation, no secrets in client bundles.
6. **Weekly ship cadence** — every Friday: deploy, changelog, KPI snapshot, next-week backlog freeze.

---

## 3. Roadmap at a Glance

| Phase | Days | Theme | Key outcome |
|---|---|---|---|
| 1 | 1–14 | Command & Control completion | Admins control everything: audit log, CSV import, plan expiry, all UI↔API gaps closed |
| 2 | 15–28 | Student excellence | Students get every facility: results, assignments, notifications, self-service |
| 3 | 29–42 | Error hunt & data integrity | Platform-wide sweep; edge cases; concurrency; orphan cleanup; performance |
| 4 | 43–56 | Advanced tools I | Analytics upgrade, PDF report center, push notifications, global search |
| 5 | 57–70 | User-friendliness pass | UX walkthrough, accessibility, Bengali i18n, onboarding, help center |
| 6 | 71–84 | Advanced tools II | AI assistant, smart timetable, exam module, billing |
| 7 | 85–100 | Scale, security & launch | Hardening, backups, load tests, beta, v1.0 go-live |

---

## 4. Phase 1 — Command & Control Completion (Day 1–14) ✅ EXECUTED (commit `45b9b20`)

**Goal:** dept_admin and super_admin can control *everything* in their scope, with an audit trail and no logic errors.

### Week 1 (Day 1–7): Fix every audit finding

- **D1** ✅ Password policy unification (API 6→8, TeacherDialog hint 8, constant-templated message) + plan-cap enforcement in super-admin provisioning. *Executed at plan creation.*
- **D2** Plan downgrade validation: when swapping a university's plan or lowering plan caps, compare current active departments/teachers/students against the new caps → friendly 409 listing what to reduce first.
- **D3** University PUT format-validation parity (contactEmail regex, websiteURL http[s]); plan edit resyncs slug + duplicate-name check.
- **D4** Broadcast fan-out → batched delivery (no silent 2000 truncation) + delivered-count feedback in the response and UI toast.
- **D5** Super admin UI: department activate/deactivate toggle; student-creation path (server path exists via manage).
- **D6** Notice dialog: expiryDate + attachmentURL controls (schema already supports both).
- **D7** Adopt `requireRole()` on all inline guards + shared `requireAdminRoute` wrapper; full smoke regression.

### Week 2 (Day 8–14): Missing command facilities

- **D8–9** **AuditLog model + `logAdminAction()`** wired into every admin/manage mutation; new "Activity" tab for super admin (filter by actor/target/university/date) + compact recent-activity card for dept admin. Also: second super-admin creation via UI (platform owner account management).
- **D10–11** **Bulk CSV import** for teachers & students: template download, dry-run preview, row-level error report, plan-cap aware, atomic commit.
- **D12** Dept-admin **batch student promotion** UI (semester move, program-length bound) reusing the existing `/api/teacher/students-move` API.
- **D13** Dept-admin **Results & Assignments management tabs** (server already grants dept_admin writes — build the UI).
- **D14** **planExpiresAt lifecycle**: expiry check at login/portal, grace banner for staff, renewal action for super admin; Phase-1 acceptance run (browser E2E + curl matrix) + deploy.

### Phase 1 acceptance checklist

- [ ] 6–7 char password rejected everywhere with a truthful message
- [ ] Over-cap provisioning blocked with a clear 409 (both dept and super-admin paths)
- [ ] Every admin mutation writes an AuditLog row, visible in the Activity tab
- [ ] CSV import of 20 students succeeds; malformed rows reported per line, nothing partially committed
- [ ] Expired university cannot log in; super admin sees the renewal action
- [ ] No UI button that calls an API its role cannot access; no server feature without UI

---

## 5. Phase 2 — Student Excellence (Day 15–28) ✅ EXECUTED (commit `7669de7`)

**Delivered:** `AssignmentSubmission` model (Turso DDL via `qa/create-submission-turso.ts`), student submit API + file download route (2 MB / MIME / ext guards client+server), teacher submissions GET + `grade-submission` PUT (max-marks clamp, student notification), student Assignments tab submit/re-submit/grade+feedback UI, teacher grading dialog ("X of Y submitted", late flags, not-submitted list), printable UGC transcript (window.print, GPA/CGPA credit-weighted), notice category + alert type filter chips, 75% shortage banner, 15-week BD-anchored attendance heatmap, next-class countdown (Dhaka clock, 30 s tick), self-service profile (phone/guardian/photo canvas-resize ≤ 150 KB), dept CSV helper bug fix (`downloadCsvText` → `downloadCsv`). Browser-verified: student submit → teacher grade → student sees 17/20 + feedback + notification; profile PATCH persisted; transcript PDF renders only the sheet; guard matrix 401/403/400 all pass.

**Goal:** every student facility complete and self-service, matching teacher-grade polish.

- **D15–16** Full student facility audit vs teacher parity matrix; freeze the gap list as the sprint backlog.
- **D17–18** Assignments tab: view, submit (file upload with size/type guard), deadline countdown, feedback/grade view.
- **D19–20** Results tab: per-course grades, GPA/CGPA (UGC rules already computed server-side), printable transcript.
- **D21–22** Notifications center: read/unread tracking, category filter, pinned notices.
- **D23–24** Attendance self-service upgrade: per-course %, 75% shortage warnings, personal monthly heatmap.
- **D25–26** Schedule view: today-highlight, next-class countdown; PWA install prompt + sound polish.
- **D27** Student profile self-service (phone edit, photo upload with size guard).
- **D28** Student acceptance run (browser E2E as a real student) + deploy.

---

## 6. Phase 3 — Error Hunt & Data Integrity (Day 29–42) ✅ EXECUTED

**Delivered:** zero-warning lint + TS-strict clean; dead code removed (`use-mobile.ts` hook, 8 un-exported internal-only helpers/types); **systemic P1 fixed** — `handle()` re-wrapped `badRequest()` NextResponses into `200 {success:true}` (unknown-entity early-exits silently succeeded); now passes through pre-built responses + both manage call-sites throw `ApiError(400)`. Contract matrix `qa/phase3-contract-matrix.ts` **51/51 PASS** (13 unauth→401, 8 wrong-role→403, 10 invalid→400/404, 17 happy 200s, unknown admin action→404). Dhaka date integrity: `bdEndOfDayUTC()` for notice expiry (POST+PUT) and planExpiresAt (previously cut off at 06:00 Dhaka on expiry day); `bdDateTimeText()`/`bdDateOnlyText()` for CSV columns and assignment-notification bodies. Concurrency: super-admin provisioning cap-check+uniqueness+create now one transaction (TOCTOU parity with /api/manage); QR supersede parallel-POST maps SQLITE_BUSY → friendly 409; scan-vs-sweep race now returns truthful `sweptAbsent` and the scan view shows an amber "window just closed — marked ABSENT" card instead of a false "already present". Data integrity: `qa/phase3-integrity.ts` verifies **PRAGMA foreign_keys = 1 on live Turso** (cascades enforced), 17 orphan anti-joins all zero, duplicate (university,email)/(dept,roll) zero, 1 stale open QR session closed. Tenant liveness: expired/deactivated university now blocked mid-session in `requireSession` + `auth/me` (login was already blocked). Status codes: missing deviceId 403→400, Prisma P2003 400→409. Performance: hard `take` caps on 8 previously unbounded lists (manage overview/lists, teacher overview, admin universities, portal, university-departments, student dashboard attendanceDates); manage GET/POST validate entity only after auth (slug-probing closed).

**Goal:** find and fix *all* remaining errors realistically — sweep, don't guess.

- **D29–30** Static sweep: zero-warning lint/TS-strict pass; dead code removal (unused helpers, dead columns).
- **D31–33** API contract matrix: every route × happy path × unauthorized × invalid input via scripted curl; fix status-code/message inconsistencies.
- **D34–35** Date/time edge cases: semester rollover, Asia/Dhaka day boundaries, attendance on rescheduled classes.
- **D36–37** Concurrency: double attendance submit, QR supersede race, plan-cap transaction races.
- **D38–39** Data integrity: orphaned rows (attendance→schedule, notice fan-out targets), soft-delete/cascade consistency, uniqueness audit.
- **D40–41** Performance: N+1 hunt on dashboards, pagination on large lists, Prisma index additions.
- **D42** Regression pack re-run (curl matrix + browser golden paths) + deploy.

---

## 7. Phase 4 — Advanced Tools I (Day 43–56)

- **D43–45** Dept analytics upgrade: attendance-trend lines per course, auto at-risk list (<75%), teacher workload balance.
- **D46–48** **Report Center** (dept admin + super admin): PDF transcripts, batch result sheets, branded attendance summaries.
- **D49–51** **Notification engine**: web push (PWA), daily digest opt-in, per-category sound rules, delivery log.
- **D52–54** **Global search** from the header: students/teachers/courses/notices/schedules, role-scoped results.
- **D55–56** Super-admin analytics upgrade: retention cohorts, feature-adoption heat, exportable CSV; acceptance + deploy.

---

## 8. Phase 5 — User-Friendliness Pass (Day 57–70)

- **D57–59** Page-by-page UX walkthrough (all roles × all tabs): consistent paddings, dialog patterns, plain-language error copy.
- **D60–61** Accessibility: ARIA labels/roles, keyboard-only navigation pass, visible focus, contrast audit.
- **D62–64** **Bengali/English i18n toggle** for all labels (default English, preference persisted per user).
- **D65–66** Onboarding: first-login guided tour per role, illustrated empty states, inline help tooltips.
- **D67–68** Help center: FAQ, role-based quick guides, contact-support card.
- **D69–70** Performance UX: skeletons everywhere, optimistic updates, image optimization; mobile re-audit at 375px + deploy.

---

## 9. Phase 6 — Advanced Tools II (Day 71–84)

- **D71–73** **AI assistant "Ask Hub"** (backend LLM SDK): admins ask natural-language questions over their dept data ("Who was absent most this month?").
- **D74–75** AI notice composer: draft/summarize notices with tone presets; teacher workload insights text.
- **D76–78** **Smart timetable generator**: conflict-free auto-arrangement honoring teacher/room/batch constraints; manual override preserved.
- **D79–80** Exam module: exam scheduling, marks-entry review flow, grade distribution per exam.
- **D81–82** Billing: invoice records, renewal reminders, mark-paid flow; payment-gateway integration decision.
- **D83–84** Stretch module gate (library OR hostel OR transport) — build or defer with written rationale; acceptance + deploy.

---

## 10. Phase 7 — Scale, Security & Launch (Day 85–100)

- **D85–87** Security hardening: rate-limit coverage on all mutations, security headers, session policy review, secret rotation drill.
- **D88–89** `middleware.ts` backstop: route-pattern guard so an unguarded route cannot ship.
- **D90–92** Backup/restore drills (Turso snapshots + local fallback), demo-tenant seed scripts, staging checklist.
- **D93–95** Load tests (typical + peak), cache hot reads, fix findings.
- **D96–98** **Beta program**: onboard 2–3 real departments; collect feedback; prioritized fix batches.
- **D99** Documentation: admin manual, teacher/student quick guides, deployment runbook.
- **D100** Launch checklist (security, backups, KPIs, support channel) · v1.0 tag · changelog · go-live.

---

## 11. KPIs & Definition of Done

- Zero critical/high bugs open at each phase gate.
- 100% of admin mutations audit-logged (from Phase 1 onward).
- Page interactive < 2s on mid-range mobile; zero console errors on golden paths.
- Every feature browser-verified (agent-browser) before merge; dev.log clean.
- Role task completion without documentation (usability spot-checks each phase).

## 12. Risk Register

| Risk | Mitigation |
|---|---|
| env-drift wipes Turso creds (has happened repeatedly) | Monday env check + startup guard log line (in place); restore procedure documented |
| Real-data regression | Destructive ops only on seeded fixtures; QR sessions never started on live slots |
| Scope creep (library/hostel/transport) | D83 decision gate; roadmap order locked |
| Turso/gateway outage | Local SQLite fallback documented; snapshot restore drill on D90 |
| Single super-admin lockout | D8–9: second super admin via UI + recovery runbook |
| Schedule slip | Compress stretch items first (D74–75, D83–84) — never the fix batches |

## 13. Weekly Cadence

- **Mon:** env-drift check + week plan.
- **Daily:** implement → browser verify → dev.log review → commit.
- **Fri:** deploy, KPI snapshot, changelog, next-week backlog freeze.
- **Phase end:** acceptance checklist + push + progress report.
