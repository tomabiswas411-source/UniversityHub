import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError } from "@/lib/session";
import type { NotificationDTO } from "@/types";
import { maybeRunCleanup } from "@/lib/cleanup";

/**
 * GET /api/notifications            — full list (last 50) + unreadCount
 * GET /api/notifications?ping=1     — COST GUARD: ~150-byte poll payload
 *                                     {unreadCount, latest?} used by the
 *                                     header bell every 45s; the full
 *                                     list is only fetched when the
 *                                     unread count actually changes or
 *                                     the dropdown opens.
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

 const [notifications, unreadCount] = await Promise.all([
 db.notification.findMany({
 where: { userId: session.userId },
 orderBy: { createdAt: "desc" },
 take: 50,
 }),
 db.notification.count({
 where: { userId: session.userId, isRead: false },
 }),
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

 return { notifications: dtos, unreadCount };
 });
}

/** PATCH /api/notifications — mark as read: { ids?: string[], all?: boolean } */
export async function PATCH(req: NextRequest) {
 return handle(async () => {
 const session = await requireSession();
 const body = await req.json().catch(() => ({}));
 const { ids, all } = body as { ids?: string[]; all?: boolean };

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
