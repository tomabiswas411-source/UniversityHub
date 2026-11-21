"use client";

/**
 * Global search (Phase 4, D52-54) — header search with role-scoped
 * results. Opens via the header button or Ctrl+K / Cmd+K anywhere,
 * debounces 250 ms, and navigates to the tab that owns the result.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Users, GraduationCap, BookOpen, Megaphone, CalendarDays, Building2, Loader2, SearchX, UserCog } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { apiGet } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";
import type { AppView } from "@/app/page";

interface SearchItem {
 id: string;
 title: string;
 subtitle: string | null;
 tab: string;
}

interface SearchGroup {
 type: string;
 label: string;
 items: SearchItem[];
}

const GROUP_ICONS: Record<string, LucideIcon> = {
 universities: Building2,
 users: UserCog,
 students: Users,
 teachers: GraduationCap,
 courses: BookOpen,
 notices: Megaphone,
 schedules: CalendarDays,
};

export function GlobalSearch({
 navigate,
 className,
}: {
 navigate: (v: AppView, params?: Record<string, string>) => void;
 className?: string;
}) {
 const [open, setOpen] = useState(false);
 const [q, setQ] = useState("");
 const [groups, setGroups] = useState<SearchGroup[]>([]);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const inputRef = useRef<HTMLInputElement>(null);
 const debounceRef = useRef<number | null>(null);
 const seqRef = useRef(0);
 const user = useAuthStore((s) => s.user);

 /* Ctrl+K / Cmd+K opens search from anywhere. */
 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
 e.preventDefault();
 if (useAuthStore.getState().user) setOpen(true);
 }
 };
 window.addEventListener("keydown", onKey);
 return () => window.removeEventListener("keydown", onKey);
 }, []);

 /* Focus the input whenever the dialog opens. */
 useEffect(() => {
 if (open) {
 setQ("");
 setGroups([]);
 setError(null);
 setTimeout(() => inputRef.current?.focus(), 60);
 }
 }, [open]);

 const runSearch = useCallback(async (term: string) => {
 const trimmed = term.trim();
 if (trimmed.length < 2) {
 setGroups([]);
 setError(null);
 setLoading(false);
 return;
 }
 const seq = ++seqRef.current;
 setLoading(true);
 try {
 const v = await apiGet<{ q: string; groups: SearchGroup[] }>(
 `/api/search?q=${encodeURIComponent(trimmed)}`
 );
 if (seq !== seqRef.current) return;
 setGroups(v.groups ?? []);
 setError(null);
 } catch (err) {
 if (seq !== seqRef.current) return;
 setGroups([]);
 setError(err instanceof Error ? err.message : "Search failed");
 } finally {
 if (seq === seqRef.current) setLoading(false);
 }
 }, []);

 const onTermChange = (term: string) => {
 setQ(term);
 if (debounceRef.current) window.clearTimeout(debounceRef.current);
 debounceRef.current = window.setTimeout(() => void runSearch(term), 250);
 };

 const go = (item: SearchItem) => {
 setOpen(false);
 navigate("dashboard", { tab: item.tab });
 };

 const totalResults = groups.reduce((a, g) => a + g.items.length, 0);
 const canShowHint = q.trim().length < 2;

 return (
 <>
 {/* Trigger — compact on all screens, keyboard hint on sm+ */}
 {user && (
 <button
 type="button"
 onClick={() => setOpen(true)}
 aria-label="Search (Ctrl+K)"
 title="Search (Ctrl+K)"
 className={cn(
 "inline-flex h-9 items-center gap-2 rounded-full border bg-secondary/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
 className
 )}
 >
 <Search className="h-4 w-4" />
 <span className="hidden min-[420px]:inline">Search</span>
 <kbd className="hidden sm:inline-flex h-5 items-center rounded border bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
 Ctrl K
 </kbd>
 </button>
 )}

 <Dialog open={open} onOpenChange={setOpen}>
 <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
 <DialogHeader className="sr-only">
 <DialogTitle>Global search</DialogTitle>
 <DialogDescription>Search {`{students, teachers, courses, notices and classes}`} scoped to your role.</DialogDescription>
 </DialogHeader>
 <div className="flex items-center gap-2 border-b px-4 py-3">
 <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
 <input
 ref={inputRef}
 value={q}
 onChange={(e) => onTermChange(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === "Enter") {
 const first = groups[0]?.items[0];
 if (first) go(first);
 }
 }}
 placeholder="Search students, courses, notices, classes…"
 aria-label="Search query"
 className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
 />
 {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
 {q && !loading && (
 <button
 type="button"
 aria-label="Clear search"
 onClick={() => {
 setQ("");
 setGroups([]);
 setError(null);
 inputRef.current?.focus();
 }}
 className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
 >
 ×
 </button>
 )}
 </div>

 <div className="max-h-[60vh] overflow-y-auto p-2" role="listbox" aria-label="Search results">
 {canShowHint ? (
 <p className="px-3 py-8 text-center text-sm text-muted-foreground">
 Type at least 2 characters — results are scoped to your role.
 </p>
 ) : error ? (
 <p className="px-3 py-8 text-center text-sm text-rose-600">{error}</p>
 ) : totalResults === 0 && !loading ? (
 <div className="flex flex-col items-center gap-2 py-8 text-center">
 <SearchX className="h-8 w-8 text-muted-foreground/60" />
 <p className="text-sm font-medium">No matches for “{q.trim()}”</p>
 <p className="text-xs text-muted-foreground">Try a name, roll number, course code or notice title.</p>
 </div>
 ) : (
 groups.map((g) => {
 const Icon = GROUP_ICONS[g.type] ?? Search;
 return (
 <div key={g.type} className="mb-1">
 <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
 {g.label}
 </p>
 {g.items.map((item) => (
 <button
 key={`${g.type}-${item.id}`}
 type="button"
 role="option"
 aria-selected={false}
 onClick={() => go(item)}
 className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent/70"
 >
 <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
 <Icon className="h-4 w-4 text-muted-foreground" />
 </span>
 <span className="min-w-0 flex-1">
 <span className="block truncate text-sm font-medium">{item.title}</span>
 {item.subtitle && (
 <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
 )}
 </span>
 </button>
 ))}
 </div>
 );
 })
 )
 }
 </div>
 </DialogContent>
 </Dialog>
 </>
 );
}
