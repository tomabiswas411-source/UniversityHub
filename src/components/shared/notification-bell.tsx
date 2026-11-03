"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Clock, Info, MapPin, Megaphone, PlusCircle, XCircle, Award, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { apiGet, apiPatch } from "@/lib/api-client";
import { useNotificationSound, showBrowserNotification } from "@/hooks/use-notification-sound";
import type { NotificationDTO } from "@/types";
import { cn } from "@/lib/utils";

interface NotificationsResponse {
  notifications: NotificationDTO[];
  unreadCount: number;
}

/** "5m ago" style relative time */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function typeIcon(type: string) {
  const t = type.replace(/^class_/, "");
  switch (t) {
    case "cancelled":
      return { Icon: XCircle, cls: "text-red-500" };
    case "rescheduled":
    case "time_changed":
      return { Icon: Clock, cls: "text-amber-500" };
    case "room_changed":
      return { Icon: MapPin, cls: "text-purple-500" };
    case "extra_class":
      return { Icon: PlusCircle, cls: "text-amber-500" };
    case "assignment":
      return { Icon: ClipboardList, cls: "text-violet-600" };
    case "result":
      return { Icon: Award, cls: "text-amber-600" };
    case "notice":
      return { Icon: Megaphone, cls: "text-violet-600" };
    default:
      return { Icon: Info, cls: "text-violet-600" };
  }
}

export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [justArrived, setJustArrived] = useState(false);
  const newestIdRef = useRef<string | null>(null);
  const firstLoadRef = useRef(true);
  const authedRef = useRef(true);
  const play = useNotificationSound();

  const fetchNotifications = useCallback(
    async (silent = false) => {
      if (!authedRef.current) return;
      try {
        const data = await apiGet<NotificationsResponse>("/api/notifications");
        setItems(data.notifications);
        setUnreadCount(data.unreadCount);

        const newest = data.notifications[0]?.id ?? null;
        if (!firstLoadRef.current && newest && newest !== newestIdRef.current && !silent) {
          const n = data.notifications[0];
          play();
          showBrowserNotification(n.title, n.body);
          setJustArrived(true);
          window.setTimeout(() => setJustArrived(false), 5000);
        }
        newestIdRef.current = newest;
        firstLoadRef.current = false;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (/401|unauthor/i.test(msg)) {
          // user logged out — stop polling silently
          authedRef.current = false;
          return;
        }
        // network hiccups ignored silently
      }
    },
    [play]
  );

  useEffect(() => {
    firstLoadRef.current = true;
    authedRef.current = true;
    const initial = window.setTimeout(() => fetchNotifications(), 0);
    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchNotifications();
    }, 30000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [fetchNotifications]);

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await apiPatch("/api/notifications", { all: true });
    } catch {
      // optimistic — silent
    }
  };

  const markRead = async (id: string) => {
    const target = items.find((n) => n.id === id);
    if (!target || target.isRead) return;
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await apiPatch("/api/notifications", { ids: [id] });
      // sync count silently
      fetchNotifications(true);
    } catch {
      // optimistic — silent
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
          <Button
            variant="ghost"
            size="sm"
            className="h-8 min-h-11 rounded-full px-3 text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 sm:min-h-0"
            onClick={markAllRead}
            disabled={unreadCount === 0}
          >
            Mark all read
          </Button>
        </div>
        <Separator />
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
                    onClick={() => markRead(n.id)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/60",
                      !n.isRead && "bg-violet-50/50 dark:bg-violet-950/20"
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
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" aria-hidden />
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
                className="w-full min-h-11 rounded-xl text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400"
                onClick={markAllRead}
              >
                Mark all read
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
