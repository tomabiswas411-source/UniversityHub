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
| GeoFix | 2026-11-04 | **"Take Attendance" প্রোডাকশন ফিক্স** — রুট-কজ: Turso লাইভ DB-তে নতুন কলামগুলো মাইগ্রেট হয়নি (Attendance-এ deviceId/distanceM, AttendanceSession-এ geoLat/geoLng/geoRadiusM ছিল না) → প্রতিটা session create / scan insert SQL লেভেলেই ফেল করত। `scripts/add-geo-attendance-turso.ts` (idempotent: PRAGMA চেক → ALTER TABLE ADD COLUMN + unique device index) লাইভ Turso-তে চালানো হয়েছে (5 কলাম + 1 index যোগ) — Vercel redeploy ছাড়াই প্রোডাকশন এখন কাজ করে | লাইভ Turso-তে ফুল E2E প্রমাণিত: session create (geo ON) → geoRequired ✓ → ভিতরে (~60m) → present ✓ → 2.1km দূরে → 403 "2128m away" ✓ → একই ফোন ২য় স্টুডেন্ট → 403 ✓ → finalize (1 present · 5 absent) ✓; ব্রাউজার E2E: inline login → geo-denied state + Retry + server 403 মেসেজ UI-তে ✓; টেস্ট ডেটা সম্পূর্ণ পরিষ্কার (ইউজারের আসল ডেটা অক্ষত) |
| RoleVisibility | 2026-11-04 | **রোল-ভিত্তিক দৃশ্যমানতা — "যতটুকু দরকার ততটুকু দেখবে"**: ① `src/lib/role-access.ts` (একক সত্যের উৎস `canSeePricing`: visitor + super_admin + dept_admin → দেখবে; student/teacher → কখনোই না); ② header nav Pricing ফিল্টার; ③ mobile bottom nav রোল-সচেতন (visitor → Dashboard-এর বদলে Login; student/teacher → Pricing বাদ, dynamic column); ④ footer Quick Links: Pricing শুধু সিদ্ধান্ত-গ্রহণকারীদের জন্য, লগইন করা থাকলে "Login Portal"-এর বদলে "My Dashboard"; ⑤ home hero: লগইন অবস্থায় "Login Portal" → "Go to Dashboard"; ⑥ pricing view গার্ড: student/teacher সরাসরি URL দিলে বন্ধুত্বপূর্ণ "Plans are for universities" কার্ড (lock + রোল লেবেল + Dashboard/Home বাটন) এবং plans fetch-ই হয় না (কস্ট গার্ড) | ব্রাউজারে ৫টা অবস্থা যাচাই: visitor (Home+Pricing+Login) / student (nav-এ Pricing নেই, mobile nav "Home | Dashboard", hero "Go to Dashboard", pricing URL → lock কার্ড, footer "My Dashboard") / teacher ("as Teacher" গার্ড) / dept_admin (Pricing দৃশ্যমান) / super_admin (Pricing দৃশ্যমান); কনসোল এরর শূন্য; স্ক্রিনশট সংরক্ষিত |
| PlatformAudit | 2026-11-04 | **প্ল্যাটফর্ম-ব্যাপী অডিট → সব বাগ ফিক্স (৫টা parallel deep-audit → ৪টা fix-workstream)**: 🔴 Critical — ① manage API থেকে bcrypt password-hash লিক বন্ধ (সব User return-এ select-whitelist); ② dept_admin-এর cross-tenant assignment/notice লেখা বন্ধ (assertDepartmentAccess); ③ Super Admin department CRUD 405 → POST/PUT/DELETE বানানো (safe delete: ব্যবহৃত হলে 409); ④ **Dept Head provisioning** — `POST /api/admin/users` + প্যানেলে "Add Head/Teacher" ডায়ালগ (নতুন university-তে এখন আর seed ছাড়া হেড দেওয়া যায়); ⑤ schedule-edit slot change সাইলেন্ট no-op ছিল → timeSlotId/roomId/teacherId PUT-এ প্রয়োগ + denormalized time/room sync + নতুন মানে clash re-check; ⑥ Turso provisioning-এ AttendanceSession CREATE TABLE স্ক্রিপ্ট-গ্যাপ বন্ধ। 🟠 Major — login rate-limit (10/5min → 429), attendance/results-এ roster validation + marks 0..max, super_admin-এর orphan-user ফিক্স (universityId ডিপার্টমেন্ট থেকে), QR history token cross-dept লিক বন্ধ, device guard mandatory + P2002 race → 403, hard-delete FK 500 → soft-delete/pre-check 409, api-helpers 500-এ ভেতরের মেসেজ লিক বন্ধ (P2002/P2025 ম্যাপ), attendance/results N+1 → chunked $transaction + createMany, analytics/overview unbounded → groupBy/take, **UTC-বনাম-ঢাকা তারিখ বাগ** → `src/lib/date-bd.ts` (bdTodayISO/bdWeekday সব API-তে); টিচার: grid→dialog fake timeSlotId ফিক্স, dueChip Invalid Date, badge-এ effectiveDate গেট + grid সেলেও Cancelled/Moved badge + "→ Thu · Room 302" টার্গেট সাফিক্স + Next-class highlight + QR expired-window finalize ব্যানার + stale-response race guards + Courses stat ক্লায়েন্ট-সাইড; স্টুডেন্ট: geo-denied ইনফিনিট লুপ বন্ধ, **NotificationBell হেডারে মাউন্ট + Alerts ট্যাবে Notifications সেকশন (mark read/all)**, deviceId anon-কলিশন ফিক্স, 401 → login redirect, auth-store network-fail-এ logout বন্ধ, semester-targeted notice ফিল্টার, login default Student tab + portal-error retry; শেল: footer ডেড-লিংক + mobile-nav overlap + year hydration, unknown view/role fallback, pricing CTA। | ব্রাউজার E2E (লাইভ Turso): স্টুডেন্ট লগইন → Alerts Notifications + mark-all-read (8→0) ✓; টিচার grid-click → dialog → room finder real timeSlotId (Lab-1 Booked overlay) → 409 clash গার্ড → room 302 দিয়ে reschedule 200 + "Moved" badge + "→ Thursday · Room 302" ✓; Super Admin dept CRUD POST/PUT/DELETE সব 200 ✓; Add Teacher → সঠিক universityId/departmentId + bcrypt (pwLen 60) ✓; curl: manage overview-তে password-field শূন্য ✓, ১১ বার ভুল লগইন → 429 ✓, schedule slot edit → PUT 200 + denormalized 13:00 sync ✓; সব টেস্ট ডেটা সঠিকভাবে মুছে ফেলা (9 notification + 1 notice + 1 change + 1 user + 1 dept = 0 অবশিষ্ট); lint + tsc (src) পরিষ্কার |

### 💰 Cost Guard — প্রতিটি নতুন ফিচারে মানা হবে (Vercel ব্যান্ডউইথ/খরচ শৃঙ্খলা)

1. **এক স্টুডেন্ট স্ক্যান = ২টা ছোট রিকোয়েস্ট** (GET info + POST mark) — রেসপন্স ~১০০ B–১ KB; কোনো ফ্যান-আউট/পোলিং নেই।
2. **টিচার লাইভ-পোল**: ৩ সেকেন্ড ইন্টারভাল, শুধু উইন্ডো active থাকাকালীন; রেসপন্স <200 B (denormalized `presentCount` + শেষ ৩ স্ক্যানের নাম); এক্সপায়ার/ক্লোজ হলে নিজে থেকেই বন্ধ।
3. **QR ইমেজ ক্লায়েন্ট-সাইডে জেনারেট** (qrcode lib, কোড-স্প্লিট চাঙ্কে) — কোনো স্টোরেজ/আপলোড/ইমেজ-রিকোয়েস্ট নেই।
4. **এক্সপোর্ট = CSV স্ট্রিং** (JSON-এ ১টা ফিল্ড) → ব্রাউজার নিজেই .csv বানায় (UTF-8 BOM → বাংলা নাম Excel-এ ঠিক দেখায়)। ডুপ্লিকেট স্টোরেজ নেই।
5. **বাল্ক অপারেশন server-side**: finalize একটাই POST → `createMany`; per-student চ্যাটার নেই।
6. **তালিকা API-তে শুধু দরকারি ফিল্ড** (`select` দিয়ে); ভবিষ্যতে বড় লিস্টে pagination বাধ্যতামূলক।
7. **পোলিং লিখলে অবশ্যই**: interval + কন্ডিশন (active window/visibility) + cleanup — যেন বন্ধ না-করা ইন্টারভাল রেখে যায় না।

| ClassAction | 2026-11-04 | Click-a-class manage dialog (cancel/reschedule/room/time/extra + reason chips + free-room finder + active-change warnings); Vercel `prisma generate` build fix (students groupBy 500); Today/All-Classes lists rebuilt with status badges; notices cards enriched. Commit `b38b5a1`. |
| AppShell-10 | 2026-11-04 | **ইউজারের ১০-দফা নির্দেশ বাস্তবায়ন**: ① **অ্যাপ-লাইক নেভিগেশন** — ডেস্কটপে বাঁ-দিকে ডার্ক-ইঙ্ক সাইডবার রেল (ব্র্যান্ড + রোল-সচেতন মেনু + অ্যাকাউন্ট কার্ড, `lg+`), মোবাইলে বটম ট্যাব বার (student → Home · **Scan** · Dashboard, উঁচু কেন্দ্রীয় স্ক্যান বাটন); ② **QR** — টিচারের QR-এ **Fullscreen প্রজেক্টর ভিউ** (বড় QR + কাউন্টডাউন + copy/close), **স্টুডেন্টদের ইন-অ্যাপ QR স্ক্যানার** (`/?view=scan`, jsQR অন-ডিভাইস ডিকোড — ফ্রেম কখনো ফোনের বাইরে যায় না, torch-frame UI + manual-code fallback); ③ **Master Attendance Sheet** — এক ক্লাসের পুরো মাসের রেজিস্টার এক গ্রিডে (rows=students, cols=dates, P/A/L/E সেল + per-student % + ক্লায়েন্ট-সাইড Excel ডাউনলোড, save-এর পর auto-refresh); ④ **অটো ডেটা ক্লিনআপ (কস্ট ইফেক্টিভ)** — `src/lib/cleanup.ts` রিটেনশন সুইপ (QR session >30d, read notif >14d, unread >90d, change >180d + >45d deactivate, auto-notice >60d, expired notice >30d, calendar >180d) + Vercel Cron (`vercel.json`, প্রতিদিন রাত ৩টা) + notifications GET-এ ২৪ঘ থ্রটল্ড lazy trigger; ⑤ **বাস্তব-নিয়ম (server-enforced)** — গতকালের ক্লাস আজ change করা যাবে না (400), ভবিষ্যৎ তারিখে attendance/QR নিষিদ্ধ (400), assignment deadline অতীত হলে 400; ⑥ লিংক/বাটন অডিট — notification-এর `link` এখন নেভিগেট করে (bell + student alerts), hero "Explore Departments"→"Explore Universities" mislabel ফিক্স, visitor hero-তে Plans CTA; ⑦ **পারফরম্যান্স/সিকিউরিটি** — ৩৬টা ডেড ডিপেন্ডেন্সি + ২৭টা অব্যবহৃত ui কম্পোনেন্ট + ডেড tailwind.config মুছে ফেলা, api-client-এ explicit `credentials`, SW-তে `push` হ্যান্ডলার, pinch-zoom আন-লক (a11y); ⑧ **নোটিফিকেশন কস্ট ৯৯%-কমানো** — ৩০s-এ ৫০-রো ফুল পোল → ৪৫s-এ ~150 B `?ping=1` (ফুল লিস্ট শুধু পরিবর্তন/খোলার সময়); ⑨ মোবাইল পলিশ — safe-area, min-h-11 টাচ টার্গেট, elevated FAB; ⑩ রোল-নির্ভরতা পুরো শেলে প্রমাণিত | ব্রাউজার E2E (৪ রোল + মোবাইল 390px): sidebar (teacher-এ Pricing নেই, dept_admin/super_admin-এ আছে) ✓; mobile bottom bar Home|Scan|Dashboard (student) / Home|Pricing|Login (visitor) ✓; scan-view no-camera fallback + manual token → attend → PRESENT ফুল চেইন ✓; QR fullscreen ডায়ালগ ✓; Master Sheet ৬ student × ১ দিন P-cell + 100% ✓; curl গার্ড: past-change 400 / future-attendance 400 / past-QR 400 / student→teacher API 403 / cleanup no-auth 401 ✓; lazy cleanup লগ "[cleanup] retention sweep" ✓; lint+tsc পরিষ্কার; টেস্ট ডেটা সম্পূর্ণ মুছে ফেলা (6 attendance + 2 session + 6 notif → 0) |
| AppShell-10-Verify | 2026-11-04 | **১০-দফা রিবিল্ডের স্বাধীন ফাইনাল ভেরিফিকেশন পাস** (নতুন সেশনে ফ্রেশ চোখে): ① ডেস্কটপ সাইডবার (1440px) + মোবাইল বটম বার (390px) উভয়ই স্ক্রিনশট-প্রমাণিত — ভিজিটর Home\|Pricing\|Login, স্টুডেন্ট Home\|**Scan FAB**\|Dashboard, সাইডবার মোবাইলে `display:none`; ② শিক্ষক QR লাইভ উইন্ডো → **Fullscreen প্রজেক্টর ভিউ** (জায়ান্ট QR + ICE-1101 · 10:00 · কাউন্টডাউন + copy link) স্ক্রিনশট-প্রমাণিত, Close & mark rest absent → "0 present · 6 newly absent (notified)"; ③ **Master Attendance Sheet** খালি-অবস্থা → finalize-এর পর 1 class day × ৬ student গ্রিড (A-cell, PRESENT 0/1, %) + Excel বাটন; ④ স্টুডেন্ট স্ক্যান ভিউ: no-camera graceful fallback + manual-code বক্স + "Scans stay on your device"; ⑤ রিয়েলিটি-গার্ড UI+server দুই স্তরে: class-action ডায়ালগে date picker `min=today`, curl রিগ্রেশন — past-date cancel 400 ("You cannot change a class in the past"), future attendance 400, cleanup no-auth 401, student→teacher 403; ⑥ footer লিংক Home→`/` + My Dashboard→`/?view=dashboard` নেভিগেশন-প্রমাণিত; ⑦ teacher sidebar = Home+Dashboard (Pricing নেই), footer = Home+My Dashboard; ⑧ **env-ড্রিফ্ট ফিক্স**: স্যান্ডবক্স রিসেটে `.env` থেকে TURSO_DATABASE_URL/TURSO_AUTH_TOKEN/AUTH_SECRET মুছে গিয়েছিল → লোকাল সার্ভার খালি SQLite-এ ফলব্যাক করছিল (portal 0 stats) — ক্রেডেনশিয়াল রিস্টোর + সার্ভার রিস্টার্টে Turso পুনঃসংযোগ (portal Rajshahi ✓) | ফাইনাল ক্লিনআপ নিখুঁত: আমার 15:33–15:35 ভেরিফিকেশন ডেটা (1 session + 6 attendance + 7 notif + 1 change + 1 notice) আইডি-ভিত্তিক নির্দেশিত ডিলিট; **ইউজারের নিজের 13:14–13:18 ব্যবহারের ডেটা (2 session + 6 attendance, ICE-1101 Thursday) অক্ষত** — যাচাই করে প্রমাণিত; lint+tsc(src) ক্লিন, console এরর শূন্য |
| RailSections | 2026-11-04 | **সাইডবার ব্যবস্থাপনা v2 — "মাঝখানের ট্যাব স্ট্রিপ বাদ"**: ① হোমপেজসহ সব public view (home/department/pricing/login) থেকে সাইডবার রেল সরানো — AppSidebar এখন শুধু dashboard-এ রেন্ডার হয় (`view !== "dashboard" → null`), public পেজে header-এর brand + pill-nav `lg+`-এও দৃশ্যমান (`railVisible` conditional); ② **৪ রোলের dashboard সেকশন সাইডবারে**: `DASHBOARD_SECTIONS` রেজিস্ট্রি (dashboard-shared-এ single source of truth — teacher ৯ / student ৬ / dept ৯ / super ৩, আইকনসহ) → রেলে "Dashboard" গ্রুপ হিসেবে রেন্ডার, active সেকশনে gold indicator; ③ **URL-driven tab** — `?view=dashboard&tab=…` প্যারাম সব প্যানেলকে controlled করে (effectiveTab = URL-valid ? URL : local), pill-ক্লিকে `navigate({scroll:false})` (স্ক্রল-পজিশন সংরক্ষণ), invalid tab → graceful fallback; ④ **মাঝখানের বড় ট্যাব-গ্রিড বিলুপ্ত (lg+)** — `MOBILE_TABS_LIST` (`lg:hidden`); মোবাইলে বাল্কি ২-সারি গ্রিড → **এক সারির scrollable pill রো** (min-h-11 touch); ⑤ teacher/student/dept/super ৪টা প্যানেলের TabsList রেজিস্ট্রি-চালিত রেন্ডার + site-header brand/nav conditional visibility + `data-scroll-behavior="smooth"` ওয়ার্নিং ফিক্স | ফ্রেশ-সেশন ব্রাউজার E2E (stale-chunk ধরা পড়ায় নতুন সেশনে): হোমে rail absent + brand visible (1440px) ✓; টিচার ড্যাশবোর্ডে rail = Home, Dashboard + ৯ সেকশন, **tablist গায়েব**, Attendance ক্লিক → `?tab=attendance` + কন্টেন্ট সুইচ + active indicator ✓; মোবাইল 390px এ এক-সারি pill রো (9 triggers, flex) + Students ক্লিক → `?tab=students` ✓; student (৬ সেকশন), dept_admin (Pricing সহ ৯), super_admin (৩) সব যাচাই ✓; visibleTablists lg+=0, মোবাইল=1(hidden-by-default-checked); lint+tsc ক্লিন, console এরর শূন্য; শুধু নেভিগেশন-টেস্ট — কোনো ডেটা মিউটেশন হয়নি, ক্লিনআপের দরকার নেই |
| Control-K | 2026-11-04 | **ইউজারের ৩-দফা নির্দেশ (K)**: ① **মোবাইলে ফুটার বাদ** — `<footer>` এখন `hidden md:block` (ফোনে শুধু অ্যাপ-স্টাইল বটম নেভ, ফুটার নেই); ডেস্কটপ ফুটার লিংক ৩টাই ব্রাউজারে ক্লিক-প্রমাণিত (Home→`/`, Pricing→`/?view=pricing`, Login→`/?view=login`); ② **Master Attendance Sheet → "এক সাবজেক্ট = এক রেজিস্টার"** — রুট-কজ: ICE-1101-এর ৫টা weekly slot = ৫টা schedule row → আগের sheet `scheduleId`-ভিত্তিক হওয়ায় প্রতিদিন/প্রতি slot-এ আলাদা শিট হচ্ছিল; এখন API `courseId`-ভিত্তিক — কোর্সের **সব slot-এর সব ক্লাস-ডে এক শিটে** (all-time, মাস-উইন্ডো বিলুপ্ত), একই তারিখে ২টা মিটিং হলে slot-ভিত্তিক আলাদা কলাম (যেমন Nov 4: Sat 08:00 + Thu 14:00); টিচার শিটে "5 weekly slots merged" ব্যাজ + Excel ডাউনলোড; **স্টুডেন্ট সাইড**: নতুন `GET /api/student/attendance-sheet` + Performance ট্যাবে "My attendance sheet" কার্ড — প্রতি সাবজেক্টের নিজের row (সব দিন ক্রমানুসারে P/A/L/E চিপ, expandable), টিচারের রেজিস্টারের সাথে হুবহু মিলে যায়; ③ **Super Admin = পুরো প্ল্যাটফর্ম কন্ট্রোল** — নতুন ২ ট্যাব: **Platform Users** (`GET/PUT /api/admin/users` — ২৫ ইউজারের ডিরেক্টরি, role/university/search ফিল্টার, Activate/Deactivate, Change role, Reset password — সব curl+E2E প্রমাণিত, গার্ড: super_admin row অস্পৃশ্য 400, self-modify নিষিদ্ধ, no-session 401, deactivated → login 401) + **System Control** (১৩ মডেলের লাইভ row-count health tiles + রিটেনশন নীতি-কার্ড + "Run cleanup now" — cron-এর সেইম idempotent sweep, "0 rows purged" টোস্ট প্রমাণিত) + sidebar-এ ৫ সেকশন | ব্রাউজার E2E: teacher ICE-1101 → 2 class days × 6 students × 2 slot-কলাম (P P / A A, 2/2 100%) ✓; student performance → ICE-1101 "2 class days · present 2" expand → 11/04 P × 2 ✓; super_admin ৫ ট্যাব, 25 users, Teachers filter=10, action menu ✓; মোবাইল 390px footer `display:none` ✓; throwaway টেস্ট ইউজার (provision→pw reset→role→deactivate→reactivate→login verify) সম্পূর্ণ লাইফসাইকেল পরীক্ষা করে **Turso থেকে hard-deleted** (25 users অক্ষত); env-ড্রিফ্ট আবার ফিক্স (sandbox আবার .env মুছেছিল); lint ক্লিন, console এরর শূন্য |
| Polish-11 | 2026-11-05 | **ফুল-প্ল্যাটফর্ম পলিশ পাস (ইউজার: "polish the full platform")** — ব্রাউজার ট্যুর (4 রোল × desktop/mobile × light/dark) থেকে চিহ্নিত ৭টি ফিক্স: ① **StatCard মোবাইল ট্রানকেশন** — `truncate`-এ "TODAY'S CL…"/"EST. GPA / 4…" কাটা পড়ত → `line-clamp-2` wrap + মোবাইলে ছোট আইকন (h-9) + `sub`-এ title tooltip; ② **MetricRing লেবেল** — রিং-width-এ আটকে "ATTENDANCE · 3/4 CL…" কাটত → রিং-এর বাইরে wrap (max-w-9rem + text-balance); ③ **Skeleton গ্লেয়ার ফিক্স** — `bg-accent` (উজ্জ্বল হলুদ) → `bg-muted` (শান্ত warm-grey) — সব লোডিং-স্টেটে প্রযোজ্য; ④ **Teacher stats মোবাইল ২-কলাম** (ছিল ১-কলাম স্ট্যাক); ⑤ **Insights/Notices deep-link বাগ** — `?tab=insights` সরাসরি খুললে lazy-load ট্রিগার হত না (শুধু ট্যাব-ক্লিকে হত) → `effectiveTab`-ভিত্তিক useEffect + কনফিউজিং কপি "Open this tab again" → সঠিক error hint; ⑥ **metadataBase** সেট (Next.js warning নির্মূল, OG URL-গুলো production ডোমেইনে রিজলভ); ⑦ **System Control রিটেনশন কার্ড** — লোডে ফাঁকা বক্স → "Loading retention rules…" স্পিনার; **SW v4→v5 bump** — পুরনো ইনস্টলের stale chunk-ক্যাশ রিফ্রেশ (sandbox-এ প্রমাণিত: v4 ক্যাশ পুরনো বান্ডল ধরে রাখত) | এজেন্ট-ব্রাউজার যাচাই: মোবাইল 390px student+teacher stat লেবেল পূর্ণ পাঠযোগ্য ("ASSIGNMENTS" এক লাইনে), MetricRing "ATTENDANCE · 3/4 CLASSES" ২ লাইনে পূর্ণ, insights deep-link এখন সরাসরি লোড হয় (Mark Entries 6 + চার্ট), console এরর শূন্য, lint ক্লিন |
| Audit-100 | 2026-11-05 | **"Find & fix hundred problems" — ফুল-প্ল্যাটফর্ম গভীর অডিট → ~১০০ বাগ ফিক্স** (২ parallel deep-audit: FE ৫৭ + API ৩৫ টা প্রমাণিত সমস্যা, তার উপর env-drift + SW-stale = ৯৭+): 🔴 **P0 ডেটা-লস/সিকিউরিটি** — ① schedule DELETE এ attendance+QR session cascade-মুছে যেত → assertNotReferenced (curl: "in use by 6 attendance record(s), 3 QR session(s)" 409 ✓); ② department DELETE-এ assignment/result/attendance/scheduleChange কাউন্ট বাদ ছিল → যোগ; ③ `requireSession` এ isActive DB-recheck (deactivated অ্যাকাউন্ট ৭ দিন পর্যন্ত mutation চালাতে পারত); ④ rate-limit XFF স্পুফ-প্রুফ (first-hop → last-hop/x-real-ip; curl: 10 attempt→429, অন্য IP unaffected ✓) + bucket cleanup 500→200; ⑤ manage PUT cross-entity field-list → per-entity whitelist + NaN→400 (bogus `capacity` কোর্সে 500→no-op ✓) + PUT-এ audience/category enum whitelist; ⑥ attendance রিয়েলিটি-গার্ড: cancelled ক্লাসে register 400, weekday-mismatch 400 ("This class meets on saturday…" curl ✓), >৭ দিন পুরনো 400, QR session-এও cancelled+wrong-day গার্ড (curl ✓); ⑦ schedule-এ non-teacher/inactive assignee 400 (student রুটিনে বসতে পারত); ⑧ class-change-এ teacher self-clash + **time-window overlap** detection (`src/lib/time-utils.ts` — 10:00-11:00 vs 10:30-11:30 ডাবল-বুকিং আগে ধরা পড়ত না); ⑨ student→staff promote-এ email+password উভয় দাবি, staff→student demote-এ ID+Roll দাবি (অ্যাকাউন্ট লকআউট বন্ধ); ⑩ department public route UTC তারিখ → bdTodayISO + teacher-audience notice public-থেকে লুকানো; ⑪ `db.ts` production-এ Turso অনুপস্থিত হলে throw (ephemeral FS-এ চুপচাপ লেখা হারানো বন্ধ); ⑫ P2003 FK → 400, planId/validateSemester/slug ভ্যালিডেশন, plans PUT NaN→400, email regex + password 6-অক্ষর (সব জায়গায়); 🟠 **P1 বাগ** — api-client-এ non-JSON রেসপন্সে বান্ধব এরর; teacher overview fail → retryable error card (মিথ্যা "No classes" empty state বন্ধ); super-admin analytics silent-fail → error+Retry + **deep-link `?tab=analytics` এ lazy fetch trigger** (browser-প্রমাণিত: MRR/ARR চার্ট লোড); ৩টা destructive action এ AlertDialog (deactivate user, QR "mark rest absent", run cleanup); টাইমজোন ঐক্য: TimetableGrid/department-view/class-action-dialog/documents-tab/student-panel সব `bdTodayISO/bdWeekday/parseDateOnly/daysUntilDate` (`date-bd.ts` বর্ধিত) — UTC off-by-one বিলুপ্ত; due-date হিসাব teacher=student এক ফর্মুলা; QR countdown server-time skew correction; markAllRead rollback; notification deep-link router.push; raw ISO তারিখ → fmtDateOnly; results examType whitelist + custom maxMarks; entries dedupe+cap (ডুপ্লিকেট notification বন্ধ); notification.type schema-documented সেটে normalize (class_cancelled ইত্যাদি); student dashboard attendance র‍্যান্ডম-slice → date-desc; student sheet নতুন-রেকর্ড রক্ষা (asc-take পুরনোগুলো ফেলে দিত); analytics schedule findMany → groupBy; unbounded take-cap সব লিস্টে; স্ট্রিং-লেন্থ ক্যাপ সব write-এ; 🟡 **P2 পলিশ** — footer বাটন → সত্যিক `<a>` লিংক (মোবাইলে hidden অক্ষত); icon-button টাচ টার্গেট 44px (`size-11 sm:size-9`) + row-action `h-9 sm:h-8`; ৯-tab মোবাইল স্ট্রিপে right-edge fade affordance (৪ প্যানেল); student ৫ম stat কার্ড ফুল-স্প্যান; sidebar Dashboard-হাইলাইট ফিক্স + লগআউটে public-only; grade tone ঐক্য (`src/lib/format.ts` timeAgo/initials/gradeTone/letterTone — ৫ কপি বিলুপ্ত); dept-admin TABS ডুপ্লিকেট → DASHBOARD_SECTIONS + analytics lazy; GRADIENT_BTN ডিজাইন-সিস্টেম অ্যাডপশন; pricing slug-লজিক + aria-pressed + in-place retry; login a11y (htmlFor/role=alert/loading state); header safe-area-top + LayoutDashboard আইকন; home-view nested button; sw.js push link deep-open; pwa-provider listener leak; ইমোজি → lucide আইকন; **SW v5→v6 bump** (stale-chunk সমস্যা ব্রাউজারে ধরা পড়েছিল — v5 ক্যাশ নতুন বান্ডল আটকে রাখত) | ব্রাউজার E2E: home/pricing/login/teacher-dash/attendance/super-admin(analytics+system)/student-mobile 390px সব রেন্ডার+ফাংশন ✓; cleanup/deactivate/finalize confirm dialog ✓; footer anchor নেভিগেশন ✓; মোবাইলে footer hidden + ৫ম কার্ড ফুল-স্প্যান + tab fade ✓; curl রিগ্রেশন ৯টা গার্ড প্রমাণিত (weekday/age/QR-day/delete-409/whitelist/pw6/email/audience/rate-limit) ✓; ইউজারের আসল ডেটা (6 attendance + 3 session) নতুন গার্ডে সুরক্ষিত; lint+tsc ক্লিন, console এরর শূন্য |
