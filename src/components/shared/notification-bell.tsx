"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, ClipboardCheck, Clock, Info, MapPin, Megaphone, PlusCircle, Settings2, XCircle, Award, ClipboardList, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { apiGet, apiPatch } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import { timeAgo } from "@/lib/format";
import { useAuthStore } from "@/store/auth-store";
import { useNotificationSound, showOsNotification } from "@/hooks/use-notification-sound";
import {
  loadPrefs,
  markSeenNow,
  lastSeenAt,
  soundEnabledFor,
  type NotificationPrefs,
} from "@/lib/notification-prefs";
import { NotificationSettingsDialog } from "@/components/shared/notification-settings-dialog";
import type { NotificationDTO } from "@/types";
import { cn } from "@/lib/utils";

interface NotificationsResponse {
  notifications: NotificationDTO[];
  unreadCount: number;
}

/** COST GUARD payload — ~150 bytes instead of the old 50-row list */
interface PingResponse {
  ping: boolean;
  unreadCount: number;
  latest: NotificationDTO | null;
}

/** "5m ago" relative time — single shared implementation (lib/format).
    Re-exported here because dept-admin / teacher / student panels still
    import it from this module. */
export { timeAgo };

/** Icon + colour class for a notification type (shared with the
    student dashboard's Alerts tab). */
export function typeIcon(type: string) {
  const t = type.replace(/^class_/, "");
  switch (t) {
    case "cancelled":
      return { Icon: XCircle, cls: "text-red-500" };
    case "rescheduled":
    case "time_changed":
      return { Icon: Clock, cls: "text-amber-500" };
    case "room_changed":
      return { Icon: MapPin, cls: "text-rust" };
    case "extra_class":
      return { Icon: PlusCircle, cls: "text-amber-500" };
    case "attendance":
      return { Icon: ClipboardCheck, cls: "text-green" };
    case "assignment":
      return { Icon: ClipboardList, cls: "text-green" };
    case "result":
      return { Icon: Award, cls: "text-amber-600" };
    case "notice":
      return { Icon: Megaphone, cls: "text-green" };
    default:
      return { Icon: Info, cls: "text-green" };
  }
}

/**
 * Follow a notification's deep link (e.g. "/?view=dashboard"). The app
 * is a query-param SPA. When a Next.js router is supplied the link is
 * pushed through it (client-side navigation); otherwise it falls back
 * to a plain location assignment for non-React callers.
 */
export function followNotificationLink(
  link: string | null | undefined,
  router?: { push: (url: string) => void }
) {
  if (!link) return false;
  try {
    if (router) router.push(link);
    else window.location.assign(link);
    return true;
  } catch {
    return false;
  }
}

export function NotificationBell({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [justArrived, setJustArrived] = useState(false);
  const [listError, setListError] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadPrefs(null));
  const newestIdRef = useRef<string | null>(null);
  const firstLoadRef = useRef(true);
  const play = useNotificationSound();
  /* Derive "should poll" from the live auth state on every tick — a ref
     latch would stay false forever after a single 401 (e.g. a temporary
     session expiry) and never resume once the user logs back in. */
  const user = useAuthStore((s) => s.user);
  /* Request cancellation: after unmount no setState may fire, and a
     stale response must never overwrite a newer one. */
  const mountedRef = useRef(true);
  const fetchSeqRef = useRef(0);
  /* Latched across effect re-creations: the polling effect re-runs when
     the auth user object is replaced by refresh(), and a local variable
     would reset to -1 each time — re-triggering the "new notification"
     path for the same unread count. Keyed by user id (reset below). */
  const lastSeenUnreadRef = useRef(-1);

  /* D49-51: load the user's sound/notification rules whenever the signed-in
     user changes, and live-follow edits made in other tabs. The sync-in-
     effect is deliberate (external store → state on identity change). */
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setPrefs(loadPrefs(user?.id ?? null));
    const onExternal = () => setPrefs(loadPrefs(user?.id ?? null));
    window.addEventListener("uh_notif_prefs_changed", onExternal);
    return () => window.removeEventListener("uh_notif_prefs_changed", onExternal);
  }, [user?.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchNotifications = useCallback(
    async (silent = false) => {
      if (!useAuthStore.getState().user) return;
      const seq = ++fetchSeqRef.current;
      try {
        const data = await apiGet<NotificationsResponse>("/api/notifications");
        // A newer fetch already landed (or we unmounted) — drop this one.
        if (seq !== fetchSeqRef.current || !mountedRef.current) return;
        setItems(data.notifications);
        setUnreadCount(data.unreadCount);
        setListError(false);

        const newest = data.notifications[0]?.id ?? null;
        if (!firstLoadRef.current && newest && newest !== newestIdRef.current && !silent) {
          const n = data.notifications[0];
          if (soundEnabledFor(prefs, n.type)) play();
          if (prefs.browser) void showOsNotification(n.title, n.body, n.link);
          setJustArrived(true);
          window.setTimeout(() => setJustArrived(false), 5000);
        }
        newestIdRef.current = newest;
        firstLoadRef.current = false;
      } catch {
        // network hiccups / 401 (store already cleared by api-client) —
        // surface an inline retry hint instead of stale silence; polling
        // resumes when a user is present again
        if (seq !== fetchSeqRef.current || !mountedRef.current) return;
        setListError(true);
      }
    },
    [play, prefs]
  );

  /* Reset the "first load" latch + newest-notification pointer when the
     signed-in user CHANGES — keyed by user id, not object identity
     (refresh() churns the user object and would otherwise re-trigger
     the new-notification sound for the same person). */
  const userId = user?.id ?? null;
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      prevUserIdRef.current = userId;
      firstLoadRef.current = true;
      newestIdRef.current = null;
      lastSeenUnreadRef.current = -1;
    }
  }, [userId]);

  /* COST GUARD: background ticks use the tiny ping endpoint. The full
     50-row list is fetched only when the dropdown opens or the ping
     reports a changed unread count. ~100× less bandwidth than polling
     the full list every 30s. */
  useEffect(() => {
    let cancelled = false;

    const initial = window.setTimeout(() => {
      if (!cancelled) void fetchNotifications();
    }, 0);

    const ping = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (!useAuthStore.getState().user) return;
      try {
        const d = await apiGet<PingResponse>("/api/notifications?ping=1");
        if (cancelled) return; // stale tick — component gone / effect re-ran
        if (d.unreadCount !== lastSeenUnreadRef.current) {
          if (
            lastSeenUnreadRef.current !== -1 &&
            d.unreadCount > lastSeenUnreadRef.current &&
            d.latest
          ) {
            // a genuinely new notification arrived — respect the user's
            // per-category sound rules and browser-notification switch (D49)
            if (soundEnabledFor(prefs, d.latest.type)) play();
            if (prefs.browser) void showOsNotification(d.latest.title, d.latest.body, d.latest.link);
            setJustArrived(true);
            window.setTimeout(() => setJustArrived(false), 5000);
          }
          lastSeenUnreadRef.current = d.unreadCount;
          setUnreadCount(d.unreadCount);
          // refresh the visible list (cheap — happens rarely)
          void fetchNotifications(true);
        }
      } catch {
        // transient errors — next tick retries
      }
    };

    const interval = window.setInterval(ping, 45000);
    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
    // Dep on the user ID (not the user object): refresh() churns object
    // identity on every poll and re-creating this interval each time would
    // drop/restart the 45s cadence for no reason.
  }, [fetchNotifications, play, prefs, userId]);

  /* D51: "while you were away" digest — computed when the dropdown opens,
     then the seen-marker advances so the same batch isn't re-summarised.
     Items snapshot is only read while open, so closed-state changes
     don't churn the memo. */
  const digest = useMemo(() => {
    if (!prefs.digest || !user || !open) return null;
    const seen = lastSeenAt(user.id);
    if (seen === 0) return null; // first-ever session — nothing to compare
    const away = items.filter((n) => !n.isRead && new Date(n.createdAt).getTime() > seen);
    if (away.length === 0) return null;
    const buckets: Record<string, number> = {};
    for (const n of away) {
      const t = (n.type ?? "general").replace(/^class_/, "");
      buckets[t] = (buckets[t] ?? 0) + 1;
    }
    const parts: string[] = [];
    const schedMoves = (buckets.rescheduled ?? 0) + (buckets.time_changed ?? 0);
    if (buckets.cancelled) parts.push(`${buckets.cancelled} cancellation${buckets.cancelled > 1 ? "s" : ""}`);
    if (schedMoves) parts.push(`${schedMoves} schedule change${schedMoves > 1 ? "s" : ""}`);
    if (buckets.room_changed) parts.push(`${buckets.room_changed} room move${buckets.room_changed > 1 ? "s" : ""}`);
    if (buckets.extra_class) parts.push(`${buckets.extra_class} extra class${buckets.extra_class > 1 ? "es" : ""}`);
    if (buckets.assignment) parts.push(`${buckets.assignment} assignment${buckets.assignment > 1 ? "s" : ""}`);
    if (buckets.result) parts.push(`${buckets.result} result${buckets.result > 1 ? "s" : ""}`);
    if (buckets.notice) parts.push(`${buckets.notice} notice${buckets.notice > 1 ? "s" : ""}`);
    const other = buckets.general ?? 0;
    if (other) parts.push(`${other} other update${other > 1 ? "s" : ""}`);
    return { count: away.length, summary: parts.slice(0, 3).join(" · ") };
  }, [items, prefs.digest, user, open]);

  const markAllRead = async () => {
    // optimistic flip — rolled back if the PATCH fails
    const prevItems = items;
    const prevUnread = unreadCount;
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await apiPatch("/api/notifications", { all: true });
    } catch {
      setItems(prevItems);
      setUnreadCount(prevUnread);
      toast({
        title: "Couldn't mark notifications as read",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleItem = async (n: NotificationDTO) => {
    if (!n.isRead) {
      // Optimistic flip — snapshot for the revert if the PATCH fails,
      // mirroring markAllRead / the student panel's markNotifRead.
      const prevItems = items;
      const prevUnread = unreadCount;
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await apiPatch("/api/notifications", { ids: [n.id] });
      } catch {
        setItems(prevItems);
        setUnreadCount(prevUnread);
        toast({
          title: "Couldn't mark as read",
          description: "The notification stays unread — try again.",
          variant: "destructive",
        });
      }
    }
    // deep-link to the related page (dashboard, etc.) — close the menu first
    setOpen(false);
    followNotificationLink(n.link, router);
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          void fetchNotifications(true);
          markSeenNow(user?.id ?? null); // digest marker advances on every open
        }
      }}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
            className={cn("relative rounded-full", className)}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span
                className={cn(
                  "absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white",
                  justArrived && "animate-pulse"
                )}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[340px] max-w-[85vw] p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Notification settings"
                title="Notification settings"
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-green"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 min-h-11 rounded-full px-3 text-xs text-green hover:text-green sm:min-h-0"
                onClick={markAllRead}
                disabled={unreadCount === 0}
              >
                Mark all read
              </Button>
            </div>
          </div>
          <Separator />
          {open && digest && (
            <div className="flex items-start gap-2.5 border-b border-border/60 bg-gold/10 px-4 py-2.5">
              <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0">
                <p className="text-xs font-semibold">While you were away — {digest.count} update{digest.count > 1 ? "s" : ""}</p>
                <p className="truncate text-[11px] text-muted-foreground">{digest.summary}</p>
              </div>
            </div>
          )}
          {listError && (
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2 text-xs">
              <span className="text-muted-foreground">Couldn't refresh notifications.</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 min-h-9 rounded-full px-2.5 text-xs font-semibold text-green hover:text-green sm:min-h-0"
                onClick={() => void fetchNotifications(true)}
              >
                Retry
              </Button>
            </div>
          )}
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <BellOff className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="text-xs text-muted-foreground">
                Updates about your classes will appear here.
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-80">
              <div className="flex flex-col">
                {items.map((n) => {
                  const { Icon, cls } = typeIcon(n.type);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => void handleItem(n)}
                      title={n.link ? "Open related page" : undefined}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/60",
                        !n.isRead && "bg-gold/10"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background shadow-sm",
                          !n.isRead && "bg-white dark:bg-background"
                        )}
                      >
                        <Icon className={cn("h-4 w-4", cls)} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {!n.isRead && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold/100" aria-hidden />
                          )}
                          <span className="truncate text-sm font-medium">{n.title}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                          {n.body}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground/70">
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
          {unreadCount > 0 && items.length > 0 && (
            <>
              <Separator />
              <div className="p-2">
                <Button
                  variant="ghost"
                  className="w-full min-h-11 rounded-xl text-sm text-green hover:text-green"
                  onClick={markAllRead}
                >
                  Mark all read
                </Button>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* D49-51: per-category sound rules + browser + digest switches */}
      <NotificationSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        userId={user?.id ?? null}
        onPrefsChange={setPrefs}
      />
    </>
  );
}
