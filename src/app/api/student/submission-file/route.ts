import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError } from "@/lib/session";

/**
 * GET /api/student/submission-file?id=<submissionId>
 * Streams the student's OWN submitted file back (data URL stored in the
 * DB). Ownership guard: only the submitting student may fetch it.
 */
export async function GET(req: NextRequest) {
 return handle(async () => {
 const session = await requireSession();
 if (session.role !== "student") {
 throw new ApiError(403, "Student access required");
 }
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) throw new ApiError(400, "id query param is required");

 const sub = await db.assignmentSubmission.findUnique({ where: { id } });
 if (!sub || !sub.fileURL) {
 throw new ApiError(404, "File not found");
 }
 if (sub.studentId !== session.userId) {
 throw new ApiError(403, "This is not your submission");
 }

 const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(sub.fileURL);
 if (!match) {
 throw new ApiError(500, "Stored file is corrupted");
 }
 const [, mime, b64] = match;
 const buffer = Buffer.from(b64, "base64");

 return new Response(new Uint8Array(buffer), {
 status: 200,
 headers: {
 "Content-Type": mime,
 "Content-Disposition": `attachment; filename="${(sub.fileName ?? "submission").replace(/"/g, "")}"`,
 "Cache-Control": "private, no-store",
 },
 });
 });
}
