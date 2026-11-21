"use client";

/**
 * Notification preference rules (Phase 4, D49-51) — per-category sound
 * rules, browser-notification switch and daily-digest opt-in.
 *
 * Stored in localStorage (key includes the user id): sound choices are
 * device-level concerns (muted laptop in a library vs. ringing phone),
 * so syncing them server-side would fight the user on every new device.
 */

export interface NotificationPrefs {
 /** Per-type sound switches — every known type defaults to ON. */
 sound: Record<string, boolean>;
 /** Browser (OS-level) notifications. */
 browser: boolean;
 /** "While you were away" digest strip in the bell dropdown. */
 digest: boolean;
}

/** All notification types the backend can fan out (see Notification model). */
export const NOTIFICATION_TYPES = [
 { value: "cancelled", label: "Class cancelled" },
 { value: "rescheduled", label: "Class rescheduled" },
 { value: "room_changed", label: "Room changed" },
 { value: "time_changed", label: "Time changed" },
 { value: "extra_class", label: "Extra class" },
 { value: "attendance", label: "QR attendance" },
 { value: "assignment", label: "Assignments" },
 { value: "result", label: "Results published" },
 { value: "notice", label: "Notices" },
 { value: "general", label: "General" },
] as const;

const STORAGE_PREFIX = "uh_notif_prefs_";

export function defaultPrefs(): NotificationPrefs {
 const sound: Record<string, boolean> = {};
 for (const t of NOTIFICATION_TYPES) sound[t.value] = true;
 return { sound, browser: true, digest: true };
}

function storageKey(userId: string | null | undefined): string {
 return `${STORAGE_PREFIX}${userId ?? "anon"}`;
}

export function loadPrefs(userId: string | null | undefined): NotificationPrefs {
 const base = defaultPrefs();
 try {
 if (typeof window === "undefined") return base;
 const raw = window.localStorage.getItem(storageKey(userId));
 if (!raw) return base;
 const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
 return {
 sound: { ...base.sound, ...(parsed.sound ?? {}) },
 browser: typeof parsed.browser === "boolean" ? parsed.browser : base.browser,
 digest: typeof parsed.digest === "boolean" ? parsed.digest : base.digest,
 };
 } catch {
 return base;
 }
}

export function savePrefs(userId: string | null | undefined, prefs: NotificationPrefs): void {
 try {
 if (typeof window === "undefined") return;
 window.localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
 window.dispatchEvent(new CustomEvent("uh_notif_prefs_changed"));
 } catch {
 // storage unavailable (private mode) — prefs stay session-local
 }
}

/** Should a sound play for this notification type under current prefs? */
export function soundEnabledFor(prefs: NotificationPrefs, type: string | null | undefined): boolean {
 const t = (type ?? "general").replace(/^class_/, "");
 return prefs.sound[t] ?? true;
}

/* ---------------- "while you were away" bookkeeping ---------------- */

const LASTSEEN_PREFIX = "uh_notif_lastseen_";

export function lastSeenAt(userId: string | null | undefined): number {
 try {
 if (typeof window === "undefined") return 0;
 const raw = window.localStorage.getItem(`${LASTSEEN_PREFIX}${userId ?? "anon"}`);
 return raw ? Number(raw) || 0 : 0;
 } catch {
 return 0;
 }
}

export function markSeenNow(userId: string | null | undefined): void {
 try {
 if (typeof window === "undefined") return;
 window.localStorage.setItem(`${LASTSEEN_PREFIX}${userId ?? "anon"}`, String(Date.now()));
 } catch {
 // ignore
 }
}
