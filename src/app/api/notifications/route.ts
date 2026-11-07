import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError } from "@/lib/session";
import type { NotificationDTO } from "@/types";
import { maybeRunCleanup } from "@/lib/cleanup";

/**
 * GET /api/notifications            — full list (first 50 by default) + unreadCount
 * GET /api/notifications?ping=1     — COST GUARD: ~150-byte poll payload
 *                                     {unreadCount, latest?} used by the
 *                                     header bell every 45s; the full
 *                                     list is only fetched when the
 *                                     unread count actually changes or
 *                                     the dropdown opens.
 * GET /api/notifications?page=N     — offset pagination (50/page, capped)
 *                                     so unread history beyond the first
 *                                     50 rows stays reachable; the
 *                                     response also carries
 *                                     {total, hasMore} for "Load older"
 *                                     controls. Page 1 is byte-identical
 *                                     in shape-plus to the legacy
 *                                     response, so existing callers are
 *                                     unaffected.
 *
 * Each authenticated GET also acts as the lazy trigger for the platform
 * data-retention sweep (throttled to once per 24h per cold start) —
 * that is how the cleanup stays free without an always-on worker.
 */
export async function GET(req: NextRequest) {
 return handle(async () => {
 const session = await requireSession();

 // Retention sweep — fire-and-forget, never blocks the response.
 void maybeRunCleanup();

 const { searchParams } = new URL(req.url);

 if (searchParams.get("ping") === "1") {
 const [unreadCount, latestUnread] = await Promise.all([
 db.notification.count({
 where: { userId: session.userId, isRead: false },
 }),
 db.notification.findFirst({
 where: { userId: session.userId, isRead: false },
 orderBy: { createdAt: "desc" },
 select: { id: true, title: true, body: true, type: true, link: true, createdAt: true },
 }),
 ]);
 return {
 ping: true as const,
 unreadCount,
 latest: latestUnread
 ? {
 id: latestUnread.id,
 title: latestUnread.title,
 body: latestUnread.body,
 type: latestUnread.type,
 link: latestUnread.link,
 isRead: false,
 createdAt: latestUnread.createdAt.toISOString(),
 }
 : null,
 };
 }

 // Offset pagination — 50/page, hard-capped so a forged ?page=9000
 // cannot walk the whole table in one request.
 const PAGE_SIZE = 50;
 const pageRaw = Number.parseInt(searchParams.get("page") ?? "", 10);
 const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 200) : 1;
 const skip = (page - 1) * PAGE_SIZE;

 const listWhere = { userId: session.userId };
 const [notifications, unreadCount, total] = await Promise.all([
 db.notification.findMany({
 where: listWhere,
 orderBy: { createdAt: "desc" },
 take: PAGE_SIZE,
 skip,
 }),
 db.notification.count({
 where: { userId: session.userId, isRead: false },
 }),
 db.notification.count({ where: listWhere }),
 ]);

 const dtos: NotificationDTO[] = notifications.map((n) => ({
 id: n.id,
 title: n.title,
 body: n.body,
 type: n.type,
 link: n.link,
 isRead: n.isRead,
 createdAt: n.createdAt.toISOString(),
 }));

 return {
 notifications: dtos,
 unreadCount,
 total,
 hasMore: skip + notifications.length < total,
 };
 });
}

/** PATCH /api/notifications — mark as read: { ids?: string[], all?: boolean } */
export async function PATCH(req: NextRequest) {
 return handle(async () => {
 const session = await requireSession();
 const body = await req.json().catch(() => ({}));
 const { ids, all } = body as { ids?: string[]; all?: boolean };

 // ids must be an array of strings — anything else (an object, a bare
 // id, numbers) previously hit Prisma's `in` filter as an opaque 500.
 if (ids !== undefined && !Array.isArray(ids)) {
 throw new ApiError(400, "ids must be an array of notification ids");
 }
 if (Array.isArray(ids) && ids.some((id) => typeof id !== "string")) {
 throw new ApiError(400, "ids must be an array of notification ids");
 }

 if (all) {
 await db.notification.updateMany({
 where: { userId: session.userId, isRead: false },
 data: { isRead: true },
 });
 } else if (ids?.length) {
 // Cap the batch — an unbounded `in` list is an easy abuse vector.
 if (ids.length > 200) {
 throw new ApiError(
 400,
 "Too many notifications at once — use 'mark all' instead"
 );
 }
 await db.notification.updateMany({
 where: { id: { in: ids }, userId: session.userId },
 data: { isRead: true },
 });
 }
 return { updated: true };
 });
}

/** DELETE /api/notifications?id=... */
export async function DELETE(req: NextRequest) {
 return handle(async () => {
 const session = await requireSession();
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) {
 throw new ApiError(400, "Notification id required");
 }
 await db.notification.deleteMany({
 where: { id, userId: session.userId },
 });
 return { deleted: true };
 });
}
