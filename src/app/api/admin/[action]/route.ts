import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError } from "@/lib/session";

/**
 * Super Admin API.
 * GET /api/admin/overview → platform stats + universities + plans
 * POST /api/admin/universities → create university
 * PUT /api/admin/universities?id=
 * DELETE /api/admin/universities?id=
 * POST /api/admin/plans → create/update plan
 */
type Ctx = { params: Promise<{ action: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
 const { action } = await ctx.params;
 return handle(async () => {
 const session = await requireSession();
 if (session.role !== "super_admin") {
 throw new ApiError(403, "Super admin access required");
 }
 const { searchParams } = new URL(req.url);

 if (action === "overview") {
 const [universities, plans] = await Promise.all([
 db.university.findMany({
 include: {
 plan: { select: { name: true, slug: true } },
 _count: {
 select: {
 departments: true,
 users: { where: { isActive: true } },
 },
 },
 },
 orderBy: { createdAt: "desc" },
 }),
 db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
 ]);

 const [totalTeachers, totalStudents, totalSchedules] = await Promise.all([
 db.user.count({ where: { role: "teacher", isActive: true } }),
 db.user.count({ where: { role: "student", isActive: true } }),
 db.schedule.count({ where: { isActive: true } }),
 ]);

 return {
 stats: {
 totalUniversities: universities.length,
 activeUniversities: universities.filter((u) => u.isActive).length,
 totalDepartments: universities.reduce(
 (acc, u) => acc + u._count.departments,
 0
 ),
 totalTeachers,
 totalStudents,
 totalSchedules,
 totalUsers: universities.reduce((acc, u) => acc + u._count.users, 0),
 },
 universities: universities.map((u) => ({
 ...u,
 planName: u.plan?.name ?? null,
 })),
 plans,
 };
 }

 if (action === "university") {
 const id = searchParams.get("id");
 if (!id) throw new ApiError(400, "id is required");
 const university = await db.university.findUnique({
 where: { id },
 include: {
 plan: true,
 departments: {
 include: {
 _count: {
 select: {
 users: { where: { role: "teacher", isActive: true } },
 schedules: { where: { isActive: true } },
 },
 },
 },
 },
 users: {
 where: { role: "dept_admin" },
 select: {
 id: true,
 fullName: true,
 email: true,
 departmentId: true,
 isActive: true,
 },
 },
 },
 });
 if (!university) throw new ApiError(404, "University not found");
 return { university };
 }

 throw new ApiError(404, "Unknown action");
 });
}

export async function POST(req: NextRequest, ctx: Ctx) {
 const { action } = await ctx.params;
 return handle(async () => {
 const session = await requireSession();
 if (session.role !== "super_admin") {
 throw new ApiError(403, "Super admin access required");
 }
 const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

 if (action === "universities") {
 const {
 name,
 slug,
 shortName,
 address,
 contactEmail,
 contactPhone,
 websiteURL,
 aboutText,
 planId,
 } = body as Record<string, string>;
 if (!name || !slug) {
 throw new ApiError(400, "University name and slug are required");
 }
 const cleanSlug = slug
 .toLowerCase()
 .trim()
 .replace(/[^a-z0-9-]/g, "-");
 const existing = await db.university.findUnique({
 where: { slug: cleanSlug },
 });
 if (existing) throw new ApiError(409, "Slug already in use");

 const university = await db.university.create({
 data: {
 name,
 slug: cleanSlug,
 shortName: shortName || null,
 address: address || null,
 contactEmail: contactEmail || null,
 contactPhone: contactPhone || null,
 websiteURL: websiteURL || null,
 aboutText: aboutText || null,
 planId: planId || null,
 },
 });

 // default site settings
 await db.siteSettings.create({
 data: { universityId: university.id, siteName: name },
 });

 return { university };
 }

 throw new ApiError(404, "Unknown action");
 });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
 const { action } = await ctx.params;
 return handle(async () => {
 const session = await requireSession();
 if (session.role !== "super_admin") {
 throw new ApiError(403, "Super admin access required");
 }
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

 if (action === "universities") {
 if (!id) throw new ApiError(400, "id is required");
 const data: Record<string, unknown> = {};
 for (const f of [
 "name",
 "shortName",
 "address",
 "contactEmail",
 "contactPhone",
 "websiteURL",
 "aboutText",
 ]) {
 if (body[f] !== undefined) data[f] = body[f] ? String(body[f]) : null;
 }
 if (body.planId !== undefined) data.planId = body.planId || null;
 if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
 if (body.slug !== undefined) {
 const cleanSlug = String(body.slug)
 .toLowerCase()
 .trim()
 .replace(/[^a-z0-9-]/g, "-");
 const existing = await db.university.findFirst({
 where: { slug: cleanSlug, id: { not: id } },
 });
 if (existing) throw new ApiError(409, "Slug already in use");
 data.slug = cleanSlug;
 }
 return db.university.update({ where: { id }, data });
 }

 if (action === "plans") {
 if (!id) throw new ApiError(400, "id is required");
 const data: Record<string, unknown> = {};
 if (body.name !== undefined) data.name = String(body.name);
 if (body.tagline !== undefined) data.tagline = String(body.tagline);
 if (body.priceMonthly !== undefined)
 data.priceMonthly = Number(body.priceMonthly);
 if (body.priceYearly !== undefined)
 data.priceYearly = Number(body.priceYearly);
 if (body.maxDepartments !== undefined)
 data.maxDepartments = Number(body.maxDepartments);
 if (body.maxStudents !== undefined)
 data.maxStudents = Number(body.maxStudents);
 if (body.maxTeachers !== undefined)
 data.maxTeachers = Number(body.maxTeachers);
 if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
 if (body.features !== undefined)
 data.features = JSON.stringify(body.features);
 return db.plan.update({ where: { id }, data });
 }

 throw new ApiError(404, "Unknown action");
 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
 const { action } = await ctx.params;
 return handle(async () => {
 const session = await requireSession();
 if (session.role !== "super_admin") {
 throw new ApiError(403, "Super admin access required");
 }
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) throw new ApiError(400, "id is required");

 if (action === "universities") {
 // Soft delete: deactivate (keeps data for audit)
 const university = await db.university.update({
 where: { id },
 data: { isActive: false },
 });
 return { university };
 }

 throw new ApiError(404, "Unknown action");
 });
}
