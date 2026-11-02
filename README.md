# UniversityHub — Multi-Tenant University Management System 🎓

A production-ready, **installable PWA** that lets any university run **all of its departments** on one platform — class routines, notices, assignments, results and **real-time notifications with sound**.

**Design language:** *Royal Violet × Amber Gold* — glass morphism, gradient text, aurora hero gradients, full dark mode.

---

## ✨ Features

| Role | Capabilities |
|---|---|
| 🛡️ **Super Admin** (System Manager) | Platform stats, create/manage universities, assign subscription plans (Free/Basic/Standard/Premium), edit plan pricing & limits, manage departments |
| 🧑‍💼 **Department Head** | Full department control: teachers, students, courses, programs, rooms, time slots, weekly schedule grid (server-side conflict detection), notices |
| 👨‍🏫 **Teacher** | My schedule, cancel / reschedule / extra-class requests (auto notice + notification fan-out), assignments, bulk result entry with auto grading |
| 🎓 **Student** | Today's classes, weekly routine, notices, assignments with due-date chips, results with grades, class-change alerts, academic calendar |

**Platform:** Multi-tenant (University → Departments → Users) · Student login with **ID Number + Roll Number** · JWT httpOnly sessions · PWA (manifest, service worker, offline shell, install prompt) · polling notification bell with **audio alert** · per-department data isolation · Turso (LibSQL) database · Prisma ORM.

## 🚀 Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftomabiswas411-source%2FUniversityHub&project-name=university-hub&repository-name=UniversityHub)

1. Click **Deploy** above (or import the repo at [vercel.com/new](https://vercel.com/new))
2. Add environment variables (Project → Settings → Environment Variables):

   | Name | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | `libsql://…` (from [Turso](https://turso.tech)) |
   | `TURSO_AUTH_TOKEN` | Turso auth token |
   | `AUTH_SECRET` | long random string (`openssl rand -hex 32`) |

3. Deploy — done. Run `bun run db:push` + `bun scripts/seed.ts` locally (with the same env) to provision the schema & demo data.

## 🔑 Demo Logins (seed data)

| Role | Credentials |
|---|---|
| Super Admin | `admin@universityhub.com` / `Admin@2025` |
| Dept Head (ICE) | `head.ice@ru.ac.bd` / `Head@2025` |
| Teacher (ICE) | `teacher1.ice@ru.ac.bd` / `Teacher@2025` |
| Student (ICE) | University `ru` · ID `2103001` · Roll `2103001` |

## 🧱 Tech Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma + Turso (LibSQL) · framer-motion · PWA (custom service worker).

## 📄 License

MIT
