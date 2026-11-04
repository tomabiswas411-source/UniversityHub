"use client";

/* ============================================================
 ClassActionDialog — "tap a class, manage it" 
 The teacher clicks any class cell / row in My Schedule and
 this dialog opens with the two headline actions:
   • Cancel Class   (rose)   — students notified instantly
   • Reschedule     (amber)  — another day / time / room
 plus compact secondary actions: Room change, Time change,
 Extra class. Every submission auto-creates the notice and
 fans out notifications (server side), so one tap is enough.

 COST GUARD: no fetching of its own except the RoomFinder's
 on-demand GET. Submit = 1 POST. Nothing polls.
============================================================ */

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  DoorOpen,
  Loader2,
  MapPin,
  Megaphone,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiPost } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { RoomFinder } from "@/components/dashboards/teacher-room-finder";
import { ChangeTypeBadge } from "@/components/dashboards/dashboard-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DAYS_OF_WEEK,
  DAY_LABELS,
  type RoomDTO,
  type ScheduleChangeDTO,
  type ScheduleDTO,
  type TimeSlotDTO,
} from "@/types";

/* ---------- mode config ---------- */
type Mode = "cancelled" | "rescheduled" | "room_changed" | "time_changed" | "extra_class";

const MODES: {
  id: Mode;
  label: string;
  hint: string;
  icon: typeof XCircle;
  tone: "rose" | "amber" | "green" | "navy";
  big: boolean;
}[] = [
  { id: "cancelled", label: "Cancel Class", hint: "Off today — students stay home", icon: XCircle, tone: "rose", big: true },
  { id: "rescheduled", label: "Reschedule", hint: "Move to another day / time", icon: ArrowRightLeft, tone: "amber", big: true },
  { id: "room_changed", label: "Room Change", hint: "Same time, new room", icon: DoorOpen, tone: "navy", big: false },
  { id: "time_changed", label: "Time Change", hint: "Same day, new slot", icon: CalendarClock, tone: "navy", big: false },
  { id: "extra_class", label: "Extra Class", hint: "Add a make-up class", icon: CalendarPlus, tone: "green", big: false },
];

const TONES: Record<string, { card: string; icon: string }> = {
  rose: {
    card: "border-rose-300 bg-rose-50 hover:border-rose-400 hover:shadow-[0_0_0_3px_rgba(225,29,72,0.08)] dark:border-rose-900/60 dark:bg-rose-950/30",
    icon: "bg-rose-600 text-white shadow-md shadow-rose-600/30",
  },
  amber: {
    card: "border-amber-300 bg-amber-50 hover:border-amber-400 hover:shadow-[0_0_0_3px_rgba(217,119,6,0.08)] dark:border-amber-900/60 dark:bg-amber-950/30",
    icon: "bg-amber-500 text-white shadow-md shadow-amber-500/30",
  },
  green: {
    card: "border-emerald-300 bg-emerald-50 hover:border-emerald-400 hover:shadow-[0_0_0_3px_rgba(5,150,105,0.08)] dark:border-emerald-900/60 dark:bg-emerald-950/30",
    icon: "bg-emerald-600 text-white shadow-md shadow-emerald-600/30",
  },
  navy: {
    card: "border-[#1B3358]/25 bg-[#1B3358]/5 hover:border-[#1B3358]/45 hover:shadow-[0_0_0_3px_rgba(27,51,88,0.07)] dark:border-[#9DB4D6]/30 dark:bg-[#1B3358]/20",
    icon: "bg-[#1B3358] text-white shadow-md shadow-[#1B3358]/30",
  },
};

const SELECTED_TONES: Record<string, string> = {
  rose: "border-rose-500 bg-rose-100/80 ring-2 ring-rose-400/50 dark:border-rose-500 dark:bg-rose-950/50",
  amber: "border-amber-500 bg-amber-100/80 ring-2 ring-amber-400/50 dark:border-amber-500 dark:bg-amber-950/50",
  green: "border-emerald-500 bg-emerald-100/80 ring-2 ring-emerald-400/50 dark:border-emerald-500 dark:bg-emerald-950/50",
  navy: "border-[#1B3358] bg-[#1B3358]/15 ring-2 ring-[#1B3358]/40 dark:border-[#9DB4D6] dark:bg-[#1B3358]/40",
};

/* Quick-pick reasons — one tap fills the box */
const QUICK_REASONS = [
  "Sick leave",
  "Official meeting",
  "Research work",
  "Public holiday",
  "Conference / seminar",
  "Unavailable today",
];

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function dayLabel(day: string | null): string {
  if (!day) return "—";
  return (DAY_LABELS as Record<string, string>)[day] ?? day;
}

export function ClassActionDialog({
  schedule,
  open,
  onOpenChange,
  rooms,
  timeSlots,
  activeChanges,
  onSubmitted,
}: {
  schedule: ScheduleDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: RoomDTO[];
  timeSlots: TimeSlotDTO[];
  /** Active (latest) changes already recorded for THIS schedule. */
  activeChanges: ScheduleChangeDTO[];
  onSubmitted: (change: ScheduleChangeDTO, notified: number) => void;
}) {
  /* ---------------- form state ---------------- */
  const [mode, setMode] = useState<Mode>("cancelled");
  const [newDay, setNewDay] = useState("");
  const [newSlot, setNewSlot] = useState("keep");
  const [newRoom, setNewRoom] = useState("keep");
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* Reset the form every time a (new) class is opened */
  useEffect(() => {
    if (open && schedule) {
      setMode("cancelled");
      setNewDay("");
      setNewSlot("keep");
      setNewRoom("keep");
      setDate(todayISO());
      setReason("");
      setSubmitting(false);
    }
  }, [open, schedule]);

  /* Which extra fields does the current mode need? */
  const showDay = mode === "rescheduled" || mode === "extra_class";
  const showSlot = mode === "rescheduled" || mode === "time_changed" || mode === "extra_class";
  const showRoom = mode !== "cancelled";
  const slotOptional = mode === "rescheduled";
  const roomOptional = mode !== "room_changed";
  const showFinder = mode === "rescheduled" || mode === "room_changed" || mode === "extra_class";

  const activeWarning = useMemo(
    () => activeChanges.find((c) => c.changeType === "cancelled") ?? activeChanges[0] ?? null,
    [activeChanges]
  );

  if (!schedule) return null;

  /* ---------------- submit ---------------- */
  async function submit() {
    if (!schedule) return;
    if (showDay && !newDay) {
      toast({ title: "Pick a day", description: "Choose which day this applies to.", variant: "destructive" });
      return;
    }
    if (showSlot && !slotOptional && newSlot === "keep") {
      toast({ title: "Pick a time slot", description: "Choose the new time for the class.", variant: "destructive" });
      return;
    }
    if (showRoom && !roomOptional && newRoom === "keep") {
      toast({ title: "Pick a new room", description: "Use the free-room finder to choose a room.", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "Reason required", description: "Students will see why the class changed.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        scheduleId: schedule.id,
        changeType: mode,
        reason: reason.trim(),
      };
      if (date) body.effectiveDate = date;
      if (mode !== "cancelled") {
        if (showDay) body.newDay = newDay;
        if (newSlot !== "keep") body.newTimeSlotId = newSlot;
        if (newRoom !== "keep") body.newRoomId = newRoom;
      }
      const data = await apiPost<{ change: ScheduleChangeDTO; notified: number }>(
        "/api/teacher/class-change",
        body
      );
      onSubmitted(data.change, data.notified ?? 0);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Couldn't submit change",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel: Record<Mode, string> = {
    cancelled: "Cancel Class & Notify",
    rescheduled: "Reschedule & Notify",
    room_changed: "Change Room & Notify",
    time_changed: "Change Time & Notify",
    extra_class: "Announce Extra Class",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          {/* class banner */}
          <div className="flex items-start gap-3 rounded-xl border bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] p-3.5 text-white shadow-md shadow-[#2D4F35]/25">
            <div className="flex h-11 min-w-16 flex-col items-center justify-center rounded-lg bg-white/15 px-1.5 backdrop-blur">
              <span className="text-xs font-bold">{schedule.startTime}</span>
              <span className="text-[10px] opacity-80">to {schedule.endTime}</span>
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle asChild>
                <p className="truncate text-sm font-bold">
                  {schedule.courseCode} · {schedule.courseName}
                </p>
              </DialogTitle>
              <DialogDescription asChild>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/85">
                  <span>{dayLabel(schedule.dayOfWeek)}</span>
                  <span aria-hidden>•</span>
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" /> Room {schedule.roomNumber}
                  </span>
                  <span aria-hidden>•</span>
                  <span>Sem {schedule.semester}</span>
                  <Badge
                    className={cn(
                      "ml-1 border-0 px-1.5 py-0 text-[10px] font-bold",
                      schedule.classType === "lab" ? "bg-amber-400 text-[#241C15]" : "bg-white/20 text-white"
                    )}
                  >
                    {schedule.classType === "lab" ? "Lab" : "Theory"}
                  </Badge>
                </p>
              </DialogDescription>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Pick an action — students get an instant notification + notice-board entry.
          </p>
        </DialogHeader>

        {/* already-changed warning */}
        {activeWarning && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300/70 bg-amber-50 p-2.5 text-xs dark:border-amber-900 dark:bg-amber-950/30">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-amber-800 dark:text-amber-300">
              This class already has an active change: <ChangeTypeBadge type={activeWarning.changeType} />{" "}
              effective {activeWarning.effectiveDate}. Submitting again adds another announcement.
            </p>
          </div>
        )}

        {/* ---------- action picker ---------- */}
        <div className="grid grid-cols-2 gap-2.5">
          {MODES.map((m) => {
            const Icon = m.icon;
            const selected = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setMode(m.id);
                  if (m.id === "cancelled") {
                    setNewSlot("keep");
                    setNewRoom("keep");
                  }
                }}
                className={cn(
                  "group flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all",
                  m.big ? "sm:p-3" : "flex-col items-start sm:flex-row sm:items-center",
                  selected
                    ? cn(SELECTED_TONES[m.tone], "shadow-sm")
                    : cn(TONES[m.tone].card, "shadow-sm")
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
                    selected ? TONES[m.tone].icon : "bg-white/70 text-[#241C15] dark:bg-white/10 dark:text-white"
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{m.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{m.hint}</span>
                </span>
                {selected && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-[#2D4F35] dark:text-[#7FB08F]" />}
              </button>
            );
          })}
        </div>

        {/* ---------- mode fields ---------- */}
        <div className="space-y-3.5 rounded-xl border bg-muted/30 p-3.5">
          {showDay && (
            <div className="space-y-1.5">
              <Label htmlFor="cad-day">{mode === "extra_class" ? "Extra class day" : "New day"} *</Label>
              <Select value={newDay} onValueChange={setNewDay}>
                <SelectTrigger id="cad-day">
                  <SelectValue placeholder="Pick a day" />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DAY_LABELS[d]}
                      {d === schedule.dayOfWeek ? " (current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showSlot && (
            <div className="space-y-1.5">
              <Label htmlFor="cad-slot">New time {slotOptional ? "(optional)" : "*"}</Label>
              <Select value={newSlot} onValueChange={setNewSlot}>
                <SelectTrigger id="cad-slot">
                  <SelectValue placeholder="Pick a time slot" />
                </SelectTrigger>
                <SelectContent>
                  {slotOptional && (
                    <SelectItem value="keep">
                      Keep current time ({schedule.startTime})
                    </SelectItem>
                  )}
                  {timeSlots.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label} · {t.startTime}–{t.endTime}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showRoom && (
            <div className="space-y-1.5">
              <Label htmlFor="cad-room">New room {roomOptional ? "(optional)" : "*"}</Label>
              <Select value={newRoom} onValueChange={setNewRoom}>
                <SelectTrigger id="cad-room">
                  <SelectValue placeholder="Pick a room" />
                </SelectTrigger>
                <SelectContent>
                  {roomOptional && (
                    <SelectItem value="keep">
                      Keep current room ({schedule.roomNumber})
                    </SelectItem>
                  )}
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Room {r.roomNumber}
                      {r.building ? ` · ${r.building}` : ""} · cap {r.capacity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showFinder && (
            <div className="rounded-lg border bg-card p-2">
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <DoorOpen className="h-3.5 w-3.5" /> Free-room finder
              </p>
              <RoomFinder
                key={`${schedule.id}-${mode}-${newDay}-${newSlot}`}
                initialDay={newDay || schedule.dayOfWeek}
                initialSlot={newSlot !== "keep" ? newSlot : schedule.timeSlotId}
                selectedRoomId={newRoom !== "keep" ? newRoom : null}
                onSelectRoom={(roomId) => setNewRoom(roomId)}
                timeSlots={timeSlots}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cad-date">Effective date</Label>
            <Input
              id="cad-date"
              type="date"
              value={date}
              min={todayISO()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cad-reason">Reason *</Label>
            <div className="flex flex-wrap gap-1.5 pb-1">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                    reason === r
                      ? "border-[#2D4F35] bg-[#2D4F35] text-white dark:border-[#7FB08F] dark:bg-[#7FB08F] dark:text-[#241C15]"
                      : "border-border bg-card text-muted-foreground hover:border-[#2D4F35]/50 hover:text-[#2D4F35] dark:hover:text-[#7FB08F]"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <Textarea
              id="cad-reason"
              rows={2}
              placeholder="Explain briefly — this is shared with your students…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        {/* active changes footer */}
        {activeChanges.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <Megaphone className="h-3.5 w-3.5" /> Active announcements for this class
            </p>
            <div className="max-h-28 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {activeChanges.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card px-2 py-1.5 text-[11px]">
                  <ChangeTypeBadge type={c.changeType} />
                  <span className="font-semibold">{c.courseCode}</span>
                  <span className="truncate text-muted-foreground">{c.reason}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">from {c.effectiveDate}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* submit */}
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={submitting}
          className={cn(
            "w-full btn-shine text-white shadow-md",
            mode === "cancelled"
              ? "bg-rose-600 shadow-rose-600/25 hover:bg-rose-700"
              : "bg-[#2D4F35] shadow-[#2D4F35]/25 hover:bg-[#3A6B47]"
          )}
        >
          {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
          {submitting ? "Notifying students…" : submitLabel[mode]}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
