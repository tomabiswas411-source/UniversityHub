import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError } from "@/lib/session";

/**
 * PATCH /api/student/profile
 * Student self-service profile edits — phone, guardian phone and photo.
 * Academic identity fields (name, roll, semester, section, program) are
 * deliberately NOT editable here: those belong to the department office.
 *
 * Body: { phone?, guardianPhone?, photoURL? }
 *  - photoURL: data URL (client-side canvas resize to ≤ 256px JPEG,
 *    ≤ 150 KB) — same data-URL storage strategy as submissions.
 */
const PHONE_MAX = 30;
const PHOTO_BYTES_MAX = 150 * 1024; // 150 KB decoded

export async function PATCH(req: NextRequest) {
 return handle(async () => {
  const session = await requireSession();
  if (session.role !== "student") {
   throw new ApiError(403, "Student access required");
  }
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.isActive) {
   throw new ApiError(403, "Account is not active");
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (body.phone !== undefined) {
   const p = String(body.phone).trim().slice(0, PHONE_MAX);
   // Loose sanity check: digits, spaces, +, - only (BD local formats).
   if (p && !/^[+0-9][0-9\s-]{5,}$/.test(p)) {
    throw new ApiError(400, "Phone number looks invalid (use digits, optional +)");
   }
   data.phone = p || null;
  }

  if (body.guardianPhone !== undefined) {
   const g = String(body.guardianPhone).trim().slice(0, PHONE_MAX);
   if (g && !/^[+0-9][0-9\s-]{5,}$/.test(g)) {
    throw new ApiError(400, "Guardian phone looks invalid (use digits, optional +)");
   }
   data.guardianPhone = g || null;
  }

  if (body.photoURL !== undefined) {
   const raw = String(body.photoURL ?? "");
   if (!raw) {
    data.photoURL = null; // clear photo
   } else {
    const match = /^data:(image\/(png|jpeg|webp));base64,([\s\S]+)$/.exec(raw);
    if (!match) {
     throw new ApiError(400, "Photo must be a PNG, JPEG or WebP image");
    }
    const approxBytes = Math.floor((match[3].length * 3) / 4);
    if (approxBytes > PHOTO_BYTES_MAX) {
     throw new ApiError(400, "Photo is too large (max 150 KB after compression)");
    }
    data.photoURL = raw;
   }
  }

  if (Object.keys(data).length === 0) {
   throw new ApiError(400, "Nothing to update");
  }

  const updated = await db.user.update({ where: { id: session.userId }, data });
  return {
   profile: {
    phone: updated.phone,
    guardianPhone: updated.guardianPhone,
    photoURL: updated.photoURL,
   },
  };
 });
}
