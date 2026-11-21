/**
 * Phase 3 (D31-33) — API contract matrix.
 *
 * Every protected route family × (unauthenticated, wrong-role, invalid
 * input, happy path). Verifies the status-code contract:
 *   401 = no/invalid session · 403 = role/scope · 400 = bad input
 *   404 = missing record · 409 = conflict · 200 = success envelope
 *
 * Run while dev server is up: bun qa/phase3-contract-matrix.ts
 */
const BASE = "http://localhost:3000";

type Jar = { cookie?: string };

async function req(
  path: string,
  opts: { method?: string; body?: unknown; jar?: Jar } = {}
): Promise<{ status: number; json: any; setCookie?: string }> {
  const res = await fetch(BASE + path, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(opts.jar?.cookie ? { cookie: opts.jar.cookie } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie") ?? undefined;
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 120) };
  }
  return { status: res.status, json, setCookie };
}

function takeSessionCookie(setCookie?: string): string | undefined {
  if (!setCookie) return undefined;
  return setCookie.split(";")[0];
}

async function login(
  path: string,
  body: Record<string, unknown>
): Promise<Jar> {
  const r = await req(path, { method: "POST", body });
  const cookie = takeSessionCookie(r.setCookie);
  if (r.status !== 200 || !cookie) {
    throw new Error(`login ${path} failed: ${r.status} ${JSON.stringify(r.json)}`);
  }
  return { cookie };
}

const results: Array<{ name: string; pass: boolean; got: string; want: string }> = [];
function check(name: string, status: number, want: number | number[]) {
  const wants = Array.isArray(want) ? want : [want];
  const pass = wants.includes(status);
  results.push({
    name,
    pass,
    got: String(status),
    want: wants.join(" or "),
  });
}

async function main() {
  // ---------- tokens ----------
  const teacher = await login("/api/auth/login", {
    email: "teacher1.ice@ru.ac.bd",
    password: "Teacher@2025",
  });
  const dept = await login("/api/auth/login", {
    email: "head.ice@ru.ac.bd",
    password: "Head@2025",
  });
  const superA = await login("/api/auth/login", {
    email: "admin@universityhub.com",
    password: "Admin@2025",
  });
  const student = await login("/api/auth/student-login", {
    universitySlug: "ru",
    studentIdNumber: "2103001",
    rollNumber: "2103001",
  });
  console.log("tokens acquired: teacher/dept/super/student");

  // ---------- A. unauthenticated → 401 ----------
  check("no-auth teacher overview", (await req("/api/teacher/overview")).status, 401);
  check("no-auth manage list", (await req("/api/manage/courses")).status, 401);
  check("no-auth manage unknown-entity (auth first)", (await req("/api/manage/definitely-not-a-real-entity")).status, 401);
  check("no-auth admin overview", (await req("/api/admin/overview")).status, 401);
  check("no-auth notifications", (await req("/api/notifications")).status, 401);
  check("no-auth student dashboard", (await req("/api/student/dashboard")).status, 401);
  check("no-auth manage POST", (
    await req("/api/manage/courses", { method: "POST", body: { name: "x" } })
  ).status, 401);
  check("no-auth attendance POST", (
    await req("/api/attendance/scan", { method: "POST", body: { token: "x" } })
  ).status, 401);
  check("no-auth attendance session POST", (
    await req("/api/attendance/session", { method: "POST", body: { scheduleId: "x" } })
  ).status, 401);
  check("no-auth student export", (await req("/api/student/export?type=results")).status, 401);
  check("no-auth student submit", (
    await req("/api/student/submit-assignment", { method: "POST", body: {} })
  ).status, 401);
  check("no-auth CSV import", (
    await req("/api/manage/import", { method: "POST", body: {} })
  ).status, 401);
  const meNoAuth = await req("/api/auth/me");
  check("no-auth auth/me returns 200 user:null", meNoAuth.status, 200);
  results.push({
    name: "no-auth auth/me user is null",
    pass: meNoAuth.json?.data?.user === null,
    got: String(meNoAuth.json?.data?.user),
    want: "null",
  });

  // ---------- B. wrong role → 403 ----------
  check("student → teacher overview", (await req("/api/teacher/overview", { jar: student })).status, 403);
  check("student → manage list", (await req("/api/manage/courses", { jar: student })).status, 403);
  check("student → admin overview", (await req("/api/admin/overview", { jar: student })).status, 403);
  check("teacher → manage list", (await req("/api/manage/courses", { jar: teacher })).status, 403);
  check("teacher → admin overview", (await req("/api/admin/overview", { jar: teacher })).status, 403);
  check("teacher → admin users action", (await req("/api/admin/users", { jar: teacher })).status, 403);
  check("dept → admin overview", (await req("/api/admin/overview", { jar: dept })).status, 403);
  check("student → teacher attendance POST", (
    await req("/api/teacher/attendance", { method: "POST", jar: student, body: {} })
  ).status, 403);

  // ---------- C. invalid input → 400 ----------
  check("login wrong password", (
    await req("/api/auth/login", { method: "POST", body: { email: "teacher1.ice@ru.ac.bd", password: "nope" } })
  ).status, 401);
  check("login unknown email", (
    await req("/api/auth/login", { method: "POST", body: { email: "nobody@ru.ac.bd", password: "whatever1" } })
  ).status, 401);
  check("student-login bad roll", (
    await req("/api/auth/student-login", {
      method: "POST",
      body: { universitySlug: "ru", studentIdNumber: "2103001", rollNumber: "WRONG" },
    })
  ).status, 401);
  check("teacher attendance missing scheduleId", (
    await req("/api/teacher/attendance", { method: "POST", jar: teacher, body: { entries: [] } })
  ).status, 400);
  check("manage teacher create bad email", (
    await req("/api/manage/teachers", {
      method: "POST",
      jar: dept,
      body: { fullName: "QA Test", email: "not-an-email", password: "QaPass@123" },
    })
  ).status, 400);
  check("manage teacher create short password", (
    await req("/api/manage/teachers", {
      method: "POST",
      jar: dept,
      body: { fullName: "QA Test", email: "qa-shortpw@ru.ac.bd", password: "12345" },
    })
  ).status, 400);
  check("manage notice bad attachment", (
    await req("/api/manage/notices", {
      method: "POST",
      jar: dept,
      body: { title: "QA", content: "QA body", attachmentURL: "ftp://nope" },
    })
  ).status, 400);
  check("manage notice bad category", (
    await req("/api/manage/notices", {
      method: "POST",
      jar: dept,
      body: { title: "QA", content: "QA body", category: "gossip" },
    })
  ).status, 400);
  check("super university PUT bad email", (
    await req("/api/admin/universities", {
      method: "PUT",
      jar: superA,
      body: { contactEmail: "broken" },
    })
  ).status, [400, 404]);
  check("manage unknown entity (authed)", (
    await req("/api/manage/not-a-real-entity", { jar: dept })
  ).status, 400);
  check("manage invalid plan id on course create", (
    await req("/api/manage/courses", {
      method: "POST",
      jar: dept,
      body: { name: "QA Course", code: "QA-101", creditHours: 1.5, programId: "does-not-exist" },
    })
  ).status, [400, 404]);

  // ---------- D. happy paths → 200 + envelope ----------
  async function happy(name: string, path: string, jar?: Jar) {
    const r = await req(path, { jar });
    const okEnvelope = r.json?.success === true;
    results.push({
      name: `happy ${name}`,
      pass: r.status === 200 && okEnvelope,
      got: `${r.status} success=${String(r.json?.success)}`,
      want: "200 success=true",
    });
    return r;
  }
  await happy("portal", "/api/portal");
  const uniDepts = await req("/api/university-departments?slug=ru");
  const firstDeptId = uniDepts.json?.data?.departments?.[0]?.id as string | undefined;
  if (!firstDeptId) throw new Error("could not resolve a department id for contract checks");
  await happy("university-departments", "/api/university-departments?slug=ru");
  await happy("department feed", `/api/department?id=${firstDeptId}`);
  await happy("teacher overview", "/api/teacher/overview", teacher);
  await happy("teacher insights", "/api/teacher/insights", teacher);
  await happy("manage overview (dept)", "/api/manage/overview", dept);
  await happy("manage courses (dept)", "/api/manage/courses", dept);
  await happy("manage activity audit (dept)", "/api/manage/activity?page=1", dept);
  await happy("manage overview (super, explicit dept)", `/api/manage/overview?departmentId=${firstDeptId}`, superA);
  await happy("student dashboard", "/api/student/dashboard", student);
  await happy("student export results", "/api/student/export?type=results", student);
  await happy("notifications", "/api/notifications", student);
  await happy("admin overview", "/api/admin/overview", superA);
  await happy("admin users", "/api/admin/users?page=1", superA);
  await happy("admin analytics", "/api/admin/analytics", superA);
  check("admin GET unknown action → 404", (await req("/api/admin/not-a-real-action", { jar: superA })).status, 404);

  // auth/me for each role
  const meDept = await req("/api/auth/me", { jar: dept });
  results.push({
    name: "auth/me dept resolves user",
    pass: meDept.status === 200 && meDept.json?.data?.user?.email === "head.ice@ru.ac.bd",
    got: `${meDept.status} ${String(meDept.json?.data?.user?.email)}`,
    want: "200 head.ice@ru.ac.bd",
  });

  // maintenance without secret → 401
  check("maintenance cleanup no secret", (await req("/api/maintenance/cleanup", { method: "POST" })).status, 401);

  // ---------- report ----------
  const failed = results.filter((r) => !r.pass);
  console.log(`\n==== CONTRACT MATRIX: ${results.length - failed.length}/${results.length} PASS ====`);
  for (const r of results) {
    console.log(` ${r.pass ? "PASS" : "FAIL"}  ${r.name}  (got ${r.got}, want ${r.want})`);
  }
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error("matrix crashed:", e);
  process.exit(2);
});
