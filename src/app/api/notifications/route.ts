import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import type { NotificationDTO } from "@/types";

/** GET /api/notifications — current user's notifications */
export async function GET() {
 return handle(async () => {
 const session = await requireSession();
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
 if (id) {
 await db.notification.deleteMany({
 where: { id, userId: session.userId },
 });
 }
 return { deleted: true };
 });
}
