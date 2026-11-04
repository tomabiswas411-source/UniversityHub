"use client";

/* ============================================================
 RoomFinder — "Which room is free right now?"
 Teacher picks a day + time slot → sees every room of the
 department colour-coded: green = free, muted = booked (with
 who booked it). Clicking a free room selects it for the
 class change form.

 COST GUARD: one GET per (day, slot) change — fetched only
 when the finder is visible, never polled.
============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, DoorOpen, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { DAYS_OF_WEEK, DAY_LABELS, type TimeSlotDTO } from "@/types";

interface FreeRoomRow {
 id: string;
 roomNumber: string;
 building: string | null;
 type: string;
 capacity: number;
 booked: { courseCode: string; teacherName: string; semester: number } | null;
}

interface FreeRoomsResponse {
 day: string;
 timeSlotId: string;
 freeCount: number;
 rooms: FreeRoomRow[];
}

export function RoomFinder({
 initialDay,
 initialSlot,
 selectedRoomId,
 onSelectRoom,
 timeSlots,
}: {
 initialDay: string;
 initialSlot: string;
 selectedRoomId: string | null;
 onSelectRoom: (roomId: string, roomNumber: string) => void;
 timeSlots: TimeSlotDTO[];
}) {
 const [day, setDay] = useState(initialDay);
 const [slotId, setSlotId] = useState(initialSlot);
 const [data, setData] = useState<FreeRoomsResponse | null>(null);
 const [loading, setLoading] = useState(false);
 const [q, setQ] = useState("");
 /* Stale-response guard: rapid day/slot switching fires overlapping
    GETs — only the newest response may render. */
 const reqSeq = useRef(0);

 const load = useCallback(async () => {
 if (!day || !slotId) return;
 const seq = ++reqSeq.current;
 setLoading(true);
 try {
 const res = await apiGet<FreeRoomsResponse>(
 `/api/teacher/free-rooms?day=${encodeURIComponent(day)}&timeSlotId=${encodeURIComponent(slotId)}`
 );
 if (seq !== reqSeq.current) return; // stale — newer (day, slot) picked
 setData(res);
 } catch (err) {
 if (seq !== reqSeq.current) return;
 toast({
 title: "Couldn't check rooms",
 description: err instanceof Error ? err.message : "Please try again.",
 variant: "destructive",
 });
 } finally {
 if (seq === reqSeq.current) setLoading(false);
 }
 }, [day, slotId]);

 useEffect(() => {
 setData(null);
 void load();
 }, [load]);

 const filtered = (data?.rooms ?? []).filter((r) =>
 q.trim() === "" ? true : r.roomNumber.toLowerCase().includes(q.trim().toLowerCase())
 );

 return (
 <div className="rounded-xl border bg-muted/30 p-3">
 <div className="mb-3 flex flex-wrap items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold/25">
 <DoorOpen className="h-4 w-4 text-[#8A7000] dark:text-gold" />
 </span>
 <p className="text-sm font-bold">Find a free room</p>
 {data && !loading && (
 <Badge
 className={cn(
 "ml-auto",
 data.freeCount > 0
 ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300"
 : "bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300"
 )}
 >
 {data.freeCount} free · {data.rooms.length} rooms
 </Badge>
 )}
 <Button
 type="button"
 variant="ghost"
 size="sm"
 className="h-7 px-2"
 onClick={() => void load()}
 disabled={loading}
 aria-label="Refresh room availability"
 >
 {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
 </Button>
 </div>

 <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
 <div className="space-y-1">
 <Label htmlFor="rf-day" className="text-xs">Day</Label>
 <Select value={day} onValueChange={setDay}>
 <SelectTrigger id="rf-day" className="h-9">
 <SelectValue placeholder="Pick a day" />
 </SelectTrigger>
 <SelectContent>
 {DAYS_OF_WEEK.map((d) => (
 <SelectItem key={d} value={d}>
 {DAY_LABELS[d]}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1">
 <Label htmlFor="rf-slot" className="text-xs">Time slot</Label>
 <Select value={slotId} onValueChange={setSlotId}>
 <SelectTrigger id="rf-slot" className="h-9">
 <SelectValue placeholder="Pick a slot" />
 </SelectTrigger>
 <SelectContent>
 {timeSlots.map((t) => (
 <SelectItem key={t.id} value={t.id}>
 {t.label} · {t.startTime}
 {t.isBreak ? " (break)" : ""}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>

 {timeSlots.length === 0 && (
 <p className="text-xs text-muted-foreground">
 No time slots configured yet — ask your Department Head to add them.
 </p>
 )}

 {day && slotId && (
 <>
 <Input
 value={q}
 onChange={(e) => setQ(e.target.value)}
 placeholder="Filter rooms… (e.g. 301)"
 className="mb-2 h-8 text-xs"
 aria-label="Filter rooms by number"
 />
 {loading && !data ? (
 <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
 <Loader2 className="h-4 w-4 animate-spin" /> Checking availability…
 </div>
 ) : filtered.length === 0 ? (
 <p className="py-4 text-center text-xs text-muted-foreground">
 <Search className="mr-1 inline h-3.5 w-3.5" />
 No rooms match your filter.
 </p>
 ) : (
 <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3 [scrollbar-width:thin]">
 {filtered.map((r) => {
 const isSelected = selectedRoomId === r.id;
 const free = !r.booked;
 return (
 <button
 key={r.id}
 type="button"
 disabled={!free}
 aria-pressed={isSelected}
 onClick={() => free && onSelectRoom(r.id, r.roomNumber)}
 className={cn(
 "rounded-lg border p-2 text-left transition-all",
 free
 ? isSelected
 ? "border-[#2D4F35] bg-[#2D4F35]/10 ring-1 ring-[#2D4F35] dark:bg-[#4A7C58]/15"
 : "border-emerald-300 bg-emerald-50/60 hover:border-emerald-400 hover:bg-emerald-100/70 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30"
 : "cursor-not-allowed border-border/60 bg-muted/40 opacity-70"
 )}
 >
 <div className="flex items-center justify-between gap-1">
 <p className="truncate text-xs font-bold">{r.roomNumber}</p>
 {free ? (
 <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
 ) : null}
 </div>
 {free ? (
 <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
 Free · cap {r.capacity}
 </p>
 ) : (
 <p className="truncate text-[10px] text-muted-foreground" title={r.booked?.courseCode}>
 {r.booked?.courseCode} · {r.booked?.semester}
 </p>
 )}
 </button>
 );
 })}
 </div>
 )}
 </>
 )}
 </div>
 );
}
