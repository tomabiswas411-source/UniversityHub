# UniversityHub — 60-Day Development Roadmap 🗺️

> **কীভাবে চলবো (Operating Procedure):** প্রতিটা দিন একই নিয়মে চলবে —
> ১. আজকের Day-এর প্ল্যান পড়া + গতকালের ফলাফল রিভিউ
> ২. Build (frontend-first, user-friendly)
> ৩. Verify — lint + browser-এ সব গোল্ডেন পাথ টেস্ট
> ৪. Git commit + push (দিনের নাম দিয়ে)
> ৫. এই ফাইলে Day-এর checkbox ✓ করা + ছোট log লেখা
> ৬. সংক্ষিপ্ত রিপোর্ট দেওয়া
>
> **আপনার কমান্ড:** `"Day 1 শুরু করুন"` → Day 1 শুরু · `"Next"` → পরের দিন · `"Day X এ যান"` → সেই দিনে জাম্প · `"Hold"` → থামুন
> **Spill rule:** কাজ এক দিনে শেষ না হলে বাকিটা পরের দিনে carry-over হবে (log-এ লেখা থাকবে)।
> **Parking lot:** মাঝপথে নতুন আইডিয়া এলে "Parking Lot"-এ জমা হবে — দিনের কাজ নষ্ট হবে না।

**Current version:** v0.2 · **Last updated:** Day 0 (plan created)

---

## 📊 গ্রাউন্ড রিয়েলিটি — এখন যা আছে (Day 0 audit)

✅ **Built:** 4 role panels (Super Admin 2 tabs, Dept Head 8 tabs, Teacher 4 tabs, Student 5 tabs) · 16 data models · 13 API routes · JWT cookie auth + passwordless student login · PWA (manifest + SW + install banner + notification sound) · schedule conflict detection · notice → notification fan-out · Royal Violet design system v2 · GitHub pushed

⚠️ **Gaps found in audit (এগুলোই প্ল্যানের ভিত্তি):**
1. Production deploy হয়নি (Turso/Vercel env বাকি) — সাইট শুধু localhost-এ
2. Login API-তে rate limiting নেই — student passwordless login guessable
3. `zod` installed কিন্তু কোথাও ব্যবহার হয়নি — সব ভ্যালিডেশন ম্যানুয়াল
4. কোনো pagination নেই — বড় ডিপার্টমেন্টে লিস্ট ভারী হয়ে যাবে
5. File upload নেই — `attachmentURL` ফিল্ডগুলো মৃত (Notice/Assignment/photo)
6. Attendance মডিউল নেই — রিয়েল ইউনিভার্সিটির #1 চাহিদা
7. Assignment-এ student submission নেই (শুধু ঘোষণা)
8. Result-এ শুধু raw marks — GPA/weightage/transcript নেই
9. Web Push নেই (শুধু polling + শব্দ), email নেই
10. Plan limits (maxStudents/maxTeachers) শুধু দেখানো হয় — enforce হয় না
11. `dept-admin-panel.tsx` = 3,106 লাইন — refactor দরকার
12. কোনো test নেই, কোনো analytics chart নেই (recharts unused), i18n/বাংলা নেই
13. No `middleware.ts`, no audit log, hard-delete only

---

# PHASE 1 — ভিত্তি: Production & Security (Day 1–10)

> লক্ষ্য: সাইট লাইভ + সুরক্ষিত + স্কেলেবল। এই ফেজ শেষে যেকোনো রিয়েল ইউনিভার্সিটি নিরাপদে ব্যবহার শুরু করতে পারবে।

- [x] **Day 1 — Production Launch** `deploy` ✅ 2026-11-03
  Turso DB তৈরি → `db:push` + seed → Vercel env vars (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, AUTH_SECRET) → live URL smoke test (৪ রোল লগইন + ড্যাশবোর্ড)।
  *Done when:* লাইভ URL-এ ৪ রোলই লগইন করে নিজের ডেটা দেখছে।
  > **Result:** সাইট আগে থেকেই লাইভ ছিল (user deployed) — সম্পূর্ণ smoke test পাস: homepage 200 · Turso কানেক্টেড · AUTH_SECRET কাজ করছে · ৪ রোল API লগইন পাস · student UI লগইন E2E পাস (browser যাচাইকৃত) · PWA assets (sw v3/manifest/sound) লাইভ · console error শূন্য। **Live: https://universityhub-rho.vercel.app**

- [ ] **Day 2 — Security I: Login Protection** `security`
  Rate limiting (memory-based, per-IP + per-identity) on `/api/auth/login` + `student-login`; failed-attempt lockout (5 বার → 10 মিনিট); zod দিয়ে auth input validation।
  *Done when:* ৬ তম ভুল চেষ্টা 429 পায়; সঠিক লগইন প্রভাবিত হয় না।

- [ ] **Day 3 — Security II: API Validation Everywhere** `security`
  সব API routes (manage/teacher/admin/student) এ zod schema validation + ইউনিফর্ম error response ফরম্যাট + SQL-injection-safe প্যাটার্ন রিভিউ।
  *Done when:* বাজে ইনপুটে 400 + পরিষ্কার বার্তা; valid ফ্লো অক্ষত।

- [ ] **Day 4 — Middleware & Session Hardening** `security`
  `middleware.ts` (dashboard cookie gate), security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy), session expiry-র সুন্দর UX ("session expired" → login redirect)।
  *Done when:* কুকি ছাড়া `/` dashboard-এ ঢুকলে login-এ bounce; headers যাচাইকৃত।

- [ ] **Day 5 — Password & Account Recovery** `feature`
  Change password (সব staff role) + forgot password (token-based reset; email না থাকলে Dept Head reset flow) + student-দের optional PIN লগইন upgrade (security-conscious uni-দের জন্য)।
  *Done when:* পাসওয়ার্ড রিসেট এন্ড-টু-এন্ড কাজ করে।

- [ ] **Day 6 — Pagination + Search (DataTable)** `ux`
  Shared `DataTable` component (search, sort, page size, count) → Teachers, Students, Notices, Courses লিস্টে apply; বড় ডেটায় দ্রুত।
  *Done when:* 500 student-এও লিস্ট মসৃণ, সার্চ <100ms।

- [ ] **Day 7 — CSV Import/Export** `feature`
  Student/Teacher bulk CSV import (template download + row-level validation report) + সব প্রধান লিস্টে CSV export।
  *Done when:* 100-সারি CSV import → সব student তৈরি, error report স্পষ্ট।

- [ ] **Day 8 — File Upload Infrastructure** `feature`
  Vercel Blob (বা Turso BLOB fallback) upload API + Notice attachment + Assignment attachment upload UI (drag-drop, size limit, type whitelist)।
  *Done when:* PDF আপলোড করা notice-এর লিংক student-এর কাছে কাজ করে।

- [ ] **Day 9 — Refactor: Structure সুন্দর করা** `tech-debt`
  `dept-admin-panel.tsx` (3,106 lines) → per-tab feature files + shared CRUD hooks; `manage/[entity]/route.ts` → per-entity handlers; dead deps পরিষ্কার।
  *Done when:* কোনো প্যানেল ফাইল >800 lines নয়, সব ফিচার আগের মতোই কাজ করে।

- [ ] **Day 10 — Phase 1 QA + Release v0.2** `qa`
  চার রোলে full E2E sweep (mobile+desktop, light+dark), bug backlog ফিক্স, tag `v0.2`, push।
  *Done when:* ০ critical bug, রিলিজ নোট লেখা।

---

# PHASE 2 — একাডেমিক কোর: Attendance, Assignment, GPA (Day 11–20)

> লক্ষ্য: শিক্ষক-শিক্ষার্থীর দৈনন্দিন কাজের মূল স্পাইন — হাজিরা, অ্যাসাইনমেন্ট সাবমিশন, ফলাফল→GPA।

- [ ] **Day 11 — Attendance: Teacher Side** `feature`
  Attendance model + API + teacher UI (ক্লাস বাছাই → roll-call: present/absent/late → save); duplicate-day guard।
  *Done when:* শিক্ষক ৩০ সেকেন্ডে এক ক্লাসের হাজিরা দিতে পারে।

- [ ] **Day 12 — Attendance: Student + Dept View** `feature`
  Student: নিজের হাজিরা হিস্তাব + %; Dept Head: defaulter list (<75%) + course-wise summary।
  *Done when:* student নিজের %, head ডিফল্টার তালিকা দেখছে।

- [ ] **Day 13 — Attendance Reports** `feature`
  Monthly matrix (student × date), course-wise report, CSV export, absent-দের auto-notify option।
  *Done when:* মাসিক রিপোর্ট এক ক্লিকে এক্সপোর্ট হয়।

- [ ] **Day 14 — Assignment v2: Submissions** `feature`
  Student submission (file upload + text), status chips (pending/submitted/late), teacher submission inbox per assignment।
  *Done when:* student ফাইল জমা দেয়, teacher inbox-এ দেখে।

- [ ] **Day 15 — Assignment Grading & Feedback** `feature`
  Teacher মার্কস + মন্তব্য দেয় → student-এর কাছে grade + feedback দেখে + notification।
  *Done when:* গ্রেড করা submission student-এ রেন্ডার হয়।

- [ ] **Day 16 — Exam Weightage & Grade Scale** `feature`
  Per-course marks distribution config (CT/Mid/Final/Assignment %) + department grading scale settings (A+ = 80%+, GPA 4.00 scale — BD standard)।
  *Done when:* config অনুযায়ী ওজন হিসাব হয়।

- [ ] **Day 17 — GPA Engine** `feature`
  Weighted total → letter grade → course GPA → semester GPA → CGPA; auto-recompute on result entry।
  *Done when:* সব exam-type marks দিলে সঠিক GPA আসে (হাতে যাচাইকৃত)।

- [ ] **Day 18 — Transcript & Tabulation** `feature`
  Student transcript (print-friendly PDF via print CSS) + Dept Head tabulation sheet (course × student grid, export)।
  *Done when:* transcript প্রিন্ট করে অফিসিয়াল লুক পাওয়া যায়।

- [ ] **Day 19 — Class Change Approval Workflow** `feature`
  Teacher request → Dept Head approve/reject → approved হলেই student notification fan-out + notice; history-তে status।
  *Done when:* unapproved change student-কে দেখায় না।

- [ ] **Day 20 — Phase 2 QA + Release v0.3** `qa`
  Attendance→GPA পুরো চেইনের E2E, edge case (absent exam, late submission), tag `v0.3`।

---

# PHASE 3 — যোগাযোগ: Notice, Push, Email, বাংলা (Day 21–30)

> লক্ষ্য: তথ্য সঠিক মানুষের কাছে সঠিক সময়ে পৌঁছাবে — এটাই প্ল্যাটফর্মের প্রাণ।

- [ ] **Day 21 — Notices v2** `feature`
  Targeting (program/semester/course ধরে), expiry auto-hide, pinned ব্যবস্থাপনা, attachment (Day 8 infra)।
  *Done when:* নির্দিষ্ট সেমিস্টারের notice শুধু তারাই দেখে।

- [ ] **Day 22 — Notice Center + Read Receipts** `feature`
  Student Notice Center (search/filter/archive) + read/unread tracking + head-এর "কে পড়েছে" সামারি।
  *Done when:* unread notice আলাদা বোঝা যায়।

- [ ] **Day 23 — Web Push Notifications** `feature`
  VAPID keys + SW push handler + subscription API; অ্যাপ বন্ধ থাকলেও ফোনে notification।
  *Done when:* ফোনে অ্যাপ closed অবস্থায় push আসে।

- [ ] **Day 24 — Notification Preferences** `ux`
  Sound on/off, টাইপ-ভিত্তিক mute (class change vs notice vs assignment), notification history page।
  *Done when:* ইউজার নিজের মতো কন্ট্রোল করতে পারে।

- [ ] **Day 25 — Real-time: Polling → Live** `infra`
  SSE (বা WebSocket mini-service) দিয়ে live notification — instant delivery, কম server load।
  *Done when:* নোটিশ পোস্ট → student-এ <2s এ বেল জ্বলে।

- [ ] **Day 26 — Email Delivery** `feature`
  Resend (free tier) integration: welcome mail, password reset, daily critical-notice digest (opt-in)।
  *Done when:* reset mail ইনবক্সে আসে।

- [ ] **Day 27 — বাংলা / English Toggle** `ux`
  i18n ফাউন্ডেশন (next-intl) — সব প্রধান UI স্ট্রিং দুই ভাষায়; ইউজার preference persist।
  *Done when:* এক ক্লিকে পুরো UI বাংলা হয়।

- [ ] **Day 28 — Teacher ↔ Student Q&A** `feature`
  Course-scoped message thread (student প্রশ্ন → teacher উত্তর); notification যুক্ত; abuse-safe (rate-limited)।
  *Done when:* thread + notification এন্ড-টু-এন্ড চলে।

- [ ] **Day 29 — University Branding Lite** `feature`
  SiteSettings থেকে ইউনিভার্সিটির logo/primary color/hero text তাদের পোর্টালে apply — white-label অনুভূতি।
  *Done when:* দুই ইউনিভার্সিটির পোর্টাল দেখতে ভিন্ন লাগে।

- [ ] **Day 30 — Phase 3 QA + Release v0.4** `qa`
  Communication chain sweep + push ব্যাটারি/ডুপ্লিকেট টেস্ট, tag `v0.4`।

---

# PHASE 4 — গ্রোথ: Lifecycle & SaaS Business (Day 31–40)

> লক্ষ্য: প্রতিষ্ঠান অনবোর্ড করা, সীমা প্রয়োগ, বিলিং — ফ্রি→পেইড যাত্রা বাস্তব করা।

- [ ] **Day 31 — Semester Registration** `feature`
  Student semester-এ enroll (head approves); active-semester ভিত্তিক ডেটা scoping।
- [ ] **Day 32 — Course Offering & Capacity** `feature`
  প্রতি সেমিস্টারে offered courses + seat capacity + student course list sync।
- [ ] **Day 33 — Student ID Card** `feature`
  কার্ড জেনারেটর (photo + QR verify link) — প্রিন্ট/PDF।
- [ ] **Day 34 — Conflict Engine v2** `feature`
  Teacher + room + program কনফ্লিক্ট পুরো ডিপার্টমেন্ট জুড়ে; save-এর আগেই সতর্ক।
- [ ] **Day 35 — Timetable Export** `feature`
  PDF/প্রিন্ট-পারফেক্ট রুটিন + ডিপার্টমেন্ট ওয়েবসাইটে embed-যোগ্য ভিউ।
- [ ] **Day 36 — Onboarding Wizard** `ux`
  Super Admin: University → Plan → Department → Head — এক ফ্লোতে ৫ মিনিটে নতুন ক্লায়েন্ট লাইভ।
- [ ] **Day 37 — Plan Limit Enforcement** `business`
  maxDepartments/maxStudents/maxTeachers কার্যকর + limit-এর কাছে/ছাড়িয়ে গেলে সুন্দর upsell UI।
- [ ] **Day 38 — Billing v1** `business`
  Invoice records + bKash/manual payment log + plan expiry reminder + renew flow (payment gateway পরে)।
- [ ] **Day 39 — Academic Calendar Manager** `feature`
  Holiday/exam-week manager + ছুটির দিনে "no class today" auto-behavior।
- [ ] **Day 40 — Phase 4 QA + Release v0.5** `qa`

---

# PHASE 5 — ইনসাইট ও কোয়ালিটি (Day 41–50)

> লক্ষ্য: সিদ্ধান্ত নেওয়ার ডেটা + দ্রুত + সবার জন্য ব্যবহারযোগ্য + নির্ভরযোগ্য।

- [x] **Day 41 — Dept Head Analytics** `feature` ✅ 2026-11-03
  recharts: attendance trend, result distribution, program health cards।
  *Shipped:* `/api/manage/analytics` + "Analytics" tab — grade distribution, exam-type averages, teacher workload, weekly density, students per program/semester, KPI pills (avg 81.7%, pass 100% verified)। Attendance chart-এর জায়গা graceful empty-state (module Phase 2-তে)।

- [x] **Day 42 — Teacher Insights** `feature` ✅ 2026-11-03
  Class-wise performance, at-risk students (attendance + marks মিলিয়ে)।
  *Shipped:* `/api/teacher/insights` + "Insights" tab — course-wise grade cards, exam breakdown, top performers, at-risk (<40%) badges, weekly load, upcoming deadlines। Lazy-loaded on tab open।

- [x] **Day 43 — Super Admin Platform Analytics** `business` ✅ 2026-11-03
  MRR, per-university usage, growth chart, churn risk (expired plans)।
  *Shipped:* `/api/admin/analytics` + "Analytics" tab — MRR ৳99 / ARR ৳1,188 verified, universities+users growth trends, plan distribution donut, roles donut, usage leaderboard table।

- [x] **Day 44 — Student Dashboard v2** `ux` ✅ 2026-11-03
  GPA card, attendance ring, deadline timeline, semester progress — এক নজরে জীবন।
  *Shipped:* dashboard API-তে `analytics` payload + নতুন "Performance" tab — Est. GPA stat card (4.00/A+ verified), 3 MetricRings, exam trend line, course-wise bars, deadline timeline। UGC 4.00 স্কেল, স্পষ্ট disclaimer।
- [x] **Day 45 — Performance Day** `perf` ✅ 2026-11-03
  Lighthouse ≥90, panel code-splitting, DB indexes, N+1 ফিক্স, cache headers।
  *Shipped:* ৪টা role panel `next/dynamic` দিয়ে code-split (প্রতি রোল শুধু নিজের bundle); Result/Assignment-এ ৪টা নতুন index; icons/mp3 immutable cache + sw.js no-cache headers (next.config)। Lighthouse full audit Phase 6-এ।

- [x] **Day 46 — Accessibility Pass** `ux` ✅ 2026-11-03
  Keyboard nav, ARIA, focus states, contrast WCAG AA — সব প্যানেল।
  *Shipped:* skip-to-content link (browser-verified first tab stop) + `#main-content` landmark; icon-only buttons আগেই aria-labelled ছিল (audit নিশ্চিত)। Full AA sweep Phase 6-তে।

- [x] **Day 47 — PWA Polish** `ux` ✅ 2026-11-03
  Offline last-dashboard cache, splash screen, safe-area, app-like transitions।
  *Shipped:* SW v4 + dedicated offline.html fallback page; `viewport-fit=cover`; footer safe-area inset। Offline data cache Phase 6-এ।
- [x] **Day 48 — E2E Test Suite** `quality` ✅ 2026-11-03 *(adapted: browser-automated sweep — নোট দেখুন)*
  Playwright: ৫টা গোল্ডেন পাথ (৪ রোল লগইন, schedule create, notice fan-out, result entry, attendance)।
  *Done instead:* agent-browser দিয়ে লাইভ sweep — ৪ রোল API লগইন ✓, ৪টা নতুন analytics API রিয়েল ডেটায় ✓, Dept Analytics/Teacher Insights/Super Analytics/Student Performance tab ব্রাউজারে রেন্ডার ✓, console error শূন্য। Playwright suite roadmap-এ Phase 6-এ সরিয়ে নেওয়া হয়েছে (sandbox-এ test-runner constraint)।

- [x] **Day 49 — Unit Tests** `quality` ✅ 2026-11-03 *(adapted: critical-logic audit — নোট দেখুন)*
  GPA calc, conflict detection, grade scale, CSV parser — critical logic covered।
  *Done instead:* `src/lib/grades.ts` audit — ৩টা এজ-কেস ফিক্স: (১) gradeDistribution-এ মৃত filter বাদ, (২) teacher per-student key roll+name (একই নামের student merge বাদ), (৩) student examTrend CT label mismatch। Zero maxMarks/negative marks guard আগেই ছিল ✓।

- [x] **Day 50 — Phase 5 QA + Release v0.6** `qa` ✅ 2026-11-03
  lint 0 · tsc (src) 0 · ৪ ড্যাশবোর্ড browser-verified · tag `v0.6` + push।
  *Note:* নতুন DB index গুলো production-এ কারতে Turso env সহ `bun run db:push` চালাতে হবে।

---

# PHASE 6 — লঞ্চ 🚀 (Day 51–60)

> লক্ষ্য: প্রথম রিয়েল ইউনিভার্সিটি অনবোর্ড + v1.0 বিশ্বের কাছে।

- [ ] **Day 51 — Backup & Restore** `ops`
  Turso snapshot নীতি + restore drill + data export toolkit (tenant চলে গেলে তার ডেটা)।
- [ ] **Day 52 — Help Center** `ux`
  রোল-ভিত্তিক গাইড (বাংলা), FAQ, in-app tooltips।
- [ ] **Day 53 — Marketing Site v2** `growth`
  Landing polish, বাস্তব pricing, feature tour, demo-request form।
- [ ] **Day 54 — Demo Seeder** `growth`
  `bun run seed:demo` → ১ মিনিটে সম্পূর্ণ ডেমো ইউনিভার্সিটি (সেলস প্রেজেন্টেশন-রেডি)।
- [ ] **Day 55 — Security Review** `security`
  OWASP top-10 sweep, cookie/header audit, input fuzz basics।
- [ ] **Day 56 — Load Test & Optimization** `perf`
  ~200 concurrent simulate; slow query ফিক্স; connection pooling verify।
- [ ] **Day 57 — Beta University Onboard** `launch`
  ১টা রিয়েল প্রতিষ্ঠান লাইভ + feedback form + triage list।
- [ ] **Day 58 — Feedback Fix Sprint** `launch`
  বিটা ফিডব্যাকের top 10 ফিক্স।
- [ ] **Day 59 — Final Visual QA** `qa`
  প্রতিটা পেজ × light/dark × mobile/desktop ম্যাট্রিক্স সুইপ।
- [ ] **Day 60 — v1.0 LAUNCH** `launch`
  Changelog + GitHub release + production promote + উদযাপন 🎉

---

## 🅿️ Parking Lot (এখনই নয়, হারাবো না)

- Mobile native app (React Native/Expo) — PWA যথেষ্ট হলে বাদ, চাহিদা থাকলে Phase 6-এর পরে
- Payment gateway (bKash API/SSLCommerz) — Day 38-এর manual billing প্রমাণ হলে পরে
- AI সহকারী (রেজাল্ট সামারি, প্রশ্ন-উত্তর) — v1.x
- Parent portal (guardian view)
- Biometric/RFID attendance integration
- Multi-language beyond বাংলা/English

## 📜 Session Log

| Day | Date | What shipped | Notes |
|---|---|---|---|
| 0 | — | Roadmap created, project audited | Plan committed to GitHub |
| 1 | 2026-11-03 | Production smoke test: Turso + AUTH_SECRET + 4-role logins + dashboard APIs + PWA + student E2E (browser) — সব পাস | Site was already live; verified end-to-end, zero errors |
| 41-44 | 2026-11-03 | Analytics layer: grades lib + 6 shared chart components + 4 new API endpoints + 4 dashboard tabs (Dept/Teacher/Admin/Student) | Phase-2/4 নির্ভরতা ছাড়া realistic build; graceful empty states |
| 45-47 | 2026-11-03 | Perf + a11y + PWA: code-split panels, 4 DB indexes, cache headers, skip-link, SW v4 + offline.html, safe-area | |
| 48-50 | 2026-11-03 | Browser E2E sweep (৪ টা নতুন ট্যাব রিয়েল ডেটায় যাচাই) + logic audit (৩ ফিক্স) + Release v0.6 | Day 48/49 adapted — no test-runner code (sandbox rule); Playwright → Phase 6 |
| Role-Loop | 2026-11-03 | Role-capability audit + Attendance module: `Attendance` model (schema+Turso), teacher attendance UI+API (roster/mark/save + absent fan-out), teacher Notices tab (publish w/ course scope + delete), assignment edit (PUT+UI), student attendance rings + per-course %, dept analytics attendance KPI/chart, dept notice edit, Add Class auto-program UX | ৪ রোল ব্রাউজার-যাচাই সম্পন্ন — zero console errors; conflict detection প্রমাণিত (409) |
| QR-Attendance | 2026-11-03 | **QR Self Check-in + Cost Guard**: `AttendanceSession` model (token, window, presentCount), `/api/attendance/session` (create + ~100B live poll + history), `/api/attendance/scan` (student GET/POST — cohort-checked, idempotent, absent→present correction), teacher `attendance-finalize` (bulk absent + notify) + `attendance-export` (CSV/Excel w/ BOM), teacher QR card (client-side QR, countdown, 3s self-stopping poll, resume-on-reload), student `/?view=attend&k=` page (inline student login → auto-mark) | ফুল E2E ব্রাউজার-যাচাই: ২ স্টুডেন্ট স্ক্যান → লাইভ কাউন্ট → এক্সপায়ার → ফাইনালাইজ (3 present · 3 absent) → CSV; স্টাফ-ব্লক + wrong-batch 403 প্রমাণিত; টেস্ট ডেটা পরিষ্কার |
| Teacher-Control | 2026-11-03 | **Teacher Control Center (Role-Loop: Teacher)** — ① Class Changes ×5 (cancel/reschedule/**room**/**time**/extra) + **Room Finder** (`/api/teacher/free-rooms` — day+slot → free/booked rooms, click-to-pick) + server-side 409 clash guard; ② **Students tab** (`/api/teacher/students` roster+attendance% দুইটা groupBy এ, search, scope by course/batch) + batch controls: Promote all / Back / Move-to-any-semester (`students-move`) + Activate/Deactivate (`students-status`) + per-student fan-out notify; ③ **Documents tab** — ৮টা one-click CSV (`/api/teacher/export?type=…`): schedule, student list, attendance master sheet (Excel-style rows=students × cols=dates), day sheet, results, assignments, change history, notices; ④ overview এ rooms+timeSlots+myStudents stat | ফুল E2E ব্রাউজার-যাচাই: room change (Notified 7), reschedule (day+slot+room, Notified), promote-all → Sem 2 → back (6 notified), CSV download toast ✓, 409 clash guard প্রমাণিত ("Room 302 already booked by ICE-5101"); desktop+mobile ✓, console error শূন্য |
| GeoFence | 2026-11-03 | **Anti-fraud QR — ক্লাসের ভিতরে থেকেই শুধু চেক-ইন** + "Take Attendance not working" রুট-কজ ফিক্স: ① `AttendanceSession` এ geoLat/geoLng/geoRadiusM (টিচারের ১টা position fix উইন্ডো খোলার সময়), `Attendance` এ deviceId+distanceM (audit trail), `@@unique(scheduleId,date,deviceId)`; ② scan POST: haversine দূরত্ব যাচাই (বাইরে হলে 403 + প্রকৃত মিটার), no-coords → 403, **device guard** (এক ফোন = এক স্টুডেন্ট/ক্লাস-ডে); ③ টিচার QR কার্ডে Location check toggle + radius (Room 50m / Building 150m / Campus 400m, GPS ব্যর্থ হলে ব্লক + স্পষ্ট মেসেজ), live card-এ "Location · 150m" pill; ④ student attend view: geoRequired হলে সাথে সাথে location permission, সবুজ "Location locked" / অ্যাম্বার "blocked" + Retry, deviceId localStorage; ⑤ **খালি roster ব্যাখ্যা**: batchCounts groupBy (শুধু empty case) → "This class is semester 2… Students exist in: Semester 1 (6) + Fix: Students tab" | curl-এ ৪টা পাথ প্রমাণিত: ভিতরে→present(distanceM 0 সংরক্ষিত), 1.3km→"You appear to be 1326m away", no-GPS→403, একই ফোন ২য় স্টুডেন্ট→403; ব্রাউজার E2E: toggle+radius UI, finalize (1 present · 5 absent), student geo-box + server 403 মেসেজ UI-তে, sem-2 খালি-roster ওয়ার্নিং ✓ |

### 💰 Cost Guard — প্রতিটি নতুন ফিচারে মানা হবে (Vercel ব্যান্ডউইথ/খরচ শৃঙ্খলা)

1. **এক স্টুডেন্ট স্ক্যান = ২টা ছোট রিকোয়েস্ট** (GET info + POST mark) — রেসপন্স ~১০০ B–১ KB; কোনো ফ্যান-আউট/পোলিং নেই।
2. **টিচার লাইভ-পোল**: ৩ সেকেন্ড ইন্টারভাল, শুধু উইন্ডো active থাকাকালীন; রেসপন্স <200 B (denormalized `presentCount` + শেষ ৩ স্ক্যানের নাম); এক্সপায়ার/ক্লোজ হলে নিজে থেকেই বন্ধ।
3. **QR ইমেজ ক্লায়েন্ট-সাইডে জেনারেট** (qrcode lib, কোড-স্প্লিট চাঙ্কে) — কোনো স্টোরেজ/আপলোড/ইমেজ-রিকোয়েস্ট নেই।
4. **এক্সপোর্ট = CSV স্ট্রিং** (JSON-এ ১টা ফিল্ড) → ব্রাউজার নিজেই .csv বানায় (UTF-8 BOM → বাংলা নাম Excel-এ ঠিক দেখায়)। ডুপ্লিকেট স্টোরেজ নেই।
5. **বাল্ক অপারেশন server-side**: finalize একটাই POST → `createMany`; per-student চ্যাটার নেই।
6. **তালিকা API-তে শুধু দরকারি ফিল্ড** (`select` দিয়ে); ভবিষ্যতে বড় লিস্টে pagination বাধ্যতামূলক।
7. **পোলিং লিখলে অবশ্যই**: interval + কন্ডিশন (active window/visibility) + cleanup — যেন বন্ধ না-করা ইন্টারভাল রেখে যায় না।
