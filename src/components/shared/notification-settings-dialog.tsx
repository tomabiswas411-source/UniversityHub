"use client";

/* The controlled-open sync below is deliberate: the dialog hydrates its
 * form state from the persisted prefs each time it opens, matching the
 * editor-dialog pattern used across this codebase. */
/* eslint-disable react-hooks/set-state-in-effect */

/**
 * Notification settings dialog (Phase 4, D49-51) — per-category sound
 * rules, OS-notification switch, digest opt-in. Persisted per user in
 * localStorage via lib/notification-prefs.
 */

import { useEffect, useState } from "react";
import { BellRing, Volume2, VolumeX, MonitorPlay, Inbox } from "lucide-react";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
 NOTIFICATION_TYPES,
 loadPrefs,
 savePrefs,
 type NotificationPrefs,
} from "@/lib/notification-prefs";
import { requestNotificationPermission } from "@/hooks/use-notification-sound";

export function NotificationSettingsDialog({
 open,
 onOpenChange,
 userId,
 onPrefsChange,
}: {
 open: boolean;
 onOpenChange: (o: boolean) => void;
 userId: string | null | undefined;
 onPrefsChange?: (p: NotificationPrefs) => void;
}) {
 const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadPrefs(userId));

 // Re-read when opened (another tab may have written newer rules).
 useEffect(() => {
 if (open) setPrefs(loadPrefs(userId));
 }, [open, userId]);

 const persist = (next: NotificationPrefs) => {
 setPrefs(next);
 savePrefs(userId, next);
 onPrefsChange?.(next);
 };

 const allOn = NOTIFICATION_TYPES.every((t) => prefs.sound[t.value] !== false);

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <BellRing className="h-4 w-4" /> Notification settings
 </DialogTitle>
 <DialogDescription>
 Choose what plays a sound, shows in your browser and greets you after a break. Saved on this device.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-4">
 {/* digest */}
 <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
 <div className="flex min-w-0 items-start gap-2.5">
 <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-green" />
 <div className="min-w-0">
 <Label htmlFor="pref-digest" className="text-sm font-medium">While-you-were-away digest</Label>
 <p className="text-xs text-muted-foreground">A short summary of unread updates when you open the bell.</p>
 </div>
 </div>
 <Switch
 id="pref-digest"
 checked={prefs.digest}
 onCheckedChange={(v) => persist({ ...prefs, digest: v })}
 aria-label="Toggle while-you-were-away digest"
 />
 </div>

 {/* browser notifications */}
 <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
 <div className="flex min-w-0 items-start gap-2.5">
 <MonitorPlay className="mt-0.5 h-4 w-4 shrink-0 text-green" />
 <div className="min-w-0">
 <Label htmlFor="pref-browser" className="text-sm font-medium">Browser notifications</Label>
 <p className="text-xs text-muted-foreground">OS-level pop-ups, also shown while the tab is hidden.</p>
 </div>
 </div>
 <Switch
 id="pref-browser"
 checked={prefs.browser}
 onCheckedChange={async (v) => {
 if (v) {
 const ok = await requestNotificationPermission();
 if (!ok) return; // denied — leave off
 }
 persist({ ...prefs, browser: v });
 }}
 aria-label="Toggle browser notifications"
 />
 </div>

 <Separator />

 {/* per-category sounds */}
 <div>
 <div className="mb-2 flex items-center justify-between">
 <p className="text-sm font-semibold">Sound rules</p>
 <Button
 variant="ghost"
 size="sm"
 className="h-8 px-2 text-xs"
 onClick={() => {
 const sound: Record<string, boolean> = {};
 for (const t of NOTIFICATION_TYPES) sound[t.value] = !allOn;
 persist({ ...prefs, sound });
 }}
 >
 {allOn ? "Mute all" : "Unmute all"}
 </Button>
 </div>
 <ScrollArea className="max-h-56 rounded-xl border p-1">
 <div className="divide-y">
 {NOTIFICATION_TYPES.map((t) => (
 <div key={t.value} className="flex items-center justify-between gap-3 px-3 py-2">
 <div className="flex min-w-0 items-center gap-2.5">
 {prefs.sound[t.value] === false ? (
 <VolumeX className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
 ) : (
 <Volume2 className="h-3.5 w-3.5 shrink-0 text-green" />
 )}
 <span className="truncate text-sm">{t.label}</span>
 </div>
 <Switch
 checked={prefs.sound[t.value] !== false}
 onCheckedChange={(v) => persist({ ...prefs, sound: { ...prefs.sound, [t.value]: v } })}
 aria-label={`Toggle sound for ${t.label}`}
 />
 </div>
 ))}
 </div>
 </ScrollArea>
 </div>
 </div>

 <DialogFooter>
 <Button className="h-9" onClick={() => onOpenChange(false)}>Done</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}
