import { db } from "@/lib/db";

interface AuditEntry {
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  universityId?: string | null;
  departmentId?: string | null;
  action: string; // create | update | deactivate | delete | broadcast | cleanup | force_close | import | promote
  entity: string; // university | plan | user | department | teacher | student | ...
  entityId?: string | null;
  entityLabel?: string | null;
  detail?: string | null;
}

/**
 * Best-effort audit trail — called after every admin/manage mutation.
 * Logging must NEVER break the main operation, so failures are swallowed.
 */
export async function logAdminAction(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorName: entry.actorName ?? null,
        actorRole: entry.actorRole ?? null,
        universityId: entry.universityId ?? null,
        departmentId: entry.departmentId ?? null,
        action: entry.action.slice(0, 40),
        entity: entry.entity.slice(0, 40),
        entityId: entry.entityId ?? null,
        entityLabel: entry.entityLabel
          ? entry.entityLabel.slice(0, 200)
          : null,
        detail: entry.detail ? entry.detail.slice(0, 1000) : null,
      },
    });
  } catch {
    // audit is best-effort by design
  }
}

/** Compact "who is acting" bundle from a session payload. */
export function auditActor(session: {
  userId: string;
  name: string;
  role: string;
  universityId: string | null;
  departmentId: string | null;
}) {
  return {
    actorId: session.userId,
    actorName: session.name,
    actorRole: session.role,
    universityId: session.universityId,
    departmentId: session.departmentId,
  };
}
