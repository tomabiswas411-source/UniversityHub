import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/session";
import type { DepartmentDTO, UniversityDTO } from "@/types";

/**
 * GET /api/university-departments?slug=ru
 * Public: university info + its active departments with counts.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    if (!slug) throw new ApiError(400, "University slug is required");

    const university = await db.university.findUnique({
      where: { slug },
    });
    if (!university || !university.isActive) {
      throw new ApiError(404, "University not found");
    }

    const departments = await db.department.findMany({
      where: { universityId: university.id, isActive: true },
      orderBy: { shortName: "asc" },
      include: {
        _count: {
          select: {
            users: { where: { role: "teacher", isActive: true } },
            courses: { where: { isActive: true } },
            schedules: { where: { isActive: true } },
          },
        },
      },
    });

    const studentCount = await db.user.count({
      where: {
        universityId: university.id,
        role: "student",
        isActive: true,
        departmentId: { in: departments.map((d) => d.id) },
      },
    });

    // distribute student count proportionally? Simpler: count per dept.
    const studentsPerDept = await db.user.groupBy({
      by: ["departmentId"],
      where: {
        universityId: university.id,
        role: "student",
        isActive: true,
      },
      _count: { id: true },
    });

    const uniDTO: UniversityDTO = {
      id: university.id,
      name: university.name,
      slug: university.slug,
      shortName: university.shortName,
      logoURL: university.logoURL,
      address: university.address,
      contactEmail: university.contactEmail,
      contactPhone: university.contactPhone,
      websiteURL: university.websiteURL,
      aboutText: university.aboutText,
      facebookURL: university.facebookURL,
      planId: university.planId,
      isActive: university.isActive,
    };

    const deptDTOs: (DepartmentDTO & {
      _count: { teachers: number; students: number; courses: number; schedules: number };
    })[] = departments.map((d) => ({
      id: d.id,
      universityId: d.universityId,
      name: d.name,
      shortName: d.shortName,
      code: d.code,
      logoURL: d.logoURL,
      description: d.description,
      building: d.building,
      contactEmail: d.contactEmail,
      contactPhone: d.contactPhone,
      facebookURL: d.facebookURL,
      isActive: d.isActive,
      _count: {
        teachers: d._count.users,
        students:
          studentsPerDept.find((s) => s.departmentId === d.id)?._count.id ?? 0,
        courses: d._count.courses,
        schedules: d._count.schedules,
      },
    }));

    return { university: uniDTO, departments: deptDTOs };
  });
}
