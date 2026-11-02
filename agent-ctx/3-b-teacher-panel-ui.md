# Task 3-b — TeacherPanel UI (teacher-panel.tsx)

**Agent:** teacher-panel-ui · **Task ID:** 3-b
**File created:** `/home/z/my-project/src/components/dashboards/teacher-panel.tsx` (single file, nothing else touched)

## Summary of implementation
- `"use client"` export `function TeacherPanel()` — tabbed teacher cockpit: My Schedule / Class Changes / Assignments / Results.
- Header: violet→fuchsia gradient banner with time-based greeting, teacher name from `useAuthStore` (`user.fullName`), "Teacher" role badge, department name, today's date, decorative blurred blobs.
- Stats row: 4 `StatCard`s — Today's Classes (amber/CalendarClock), Weekly Classes (violet/CalendarDays), Courses (fuchsia/BookOpen), Change History (rose/History, live `changes.length`).
- My Schedule: `TimetableGrid` + "Today" list (sorted by startTime, time chip, courseCode·name, room, theory/lab badge).
- Class Changes: request form (schedule select, type select simplified to cancelled / rescheduled-to-day / extra_class, conditional newDay select, effective date (default today, min today), required reason textarea) + scrollable history (ChangeTypeBadge, reason clamp-2, effective date, `timeAgo`).
- Assignments: course filter select, New Assignment Dialog (course/title/description/dueDate/maxMarks), list rows with course badge, clamp-2 description, due chip (rose overdue / amber ≤3d / muted), maxMarks chip, timeAgo, delete via AlertDialog.
- Results: course select → GET results; published entries scroll list (ExamTypeBadge, marks/20, grade badge); entry `Table` (overflow-x-auto) with number inputs (0–20, "Marks (out of 20)"), prefill from existing results per examType, live grade compute (A+≥16, A≥14, A-≥12, B≥10, C≥8, D≥6, F), Save All posts only filled rows → toast saved count → reload.
- All lists: framer-motion stagger (fade + 12px slide), EmptyState when empty, PanelLoader while loading, custom violet scrollbar on `max-h-96 overflow-y-auto` lists, toast destructive on all errors, Loader2 + disabled during submits.

## Contract adaptations (for downstream agents)
1. **Synthetic time slots**: overview schedules have no resolvable `timeSlotId`, so synthetic `TimeSlotDTO[]` are derived (id = startTime, label = startTime, slotOrder = sorted index, isBreak false, departmentId ""). **Each schedule's `timeSlotId` is remapped to `s.startTime`** so `TimetableGrid`'s row matching (`s.timeSlotId === slot.id`) lines up.
2. **Change types limited to** `cancelled` / `rescheduled` / `extra_class` (per brief decision): reschedule sends `newDay` only (time unchanged — server keeps original time), no `newTimeSlotId`/`newRoomId` ever sent; hint text tells teachers time/room changes go through the Department Head.
3. **AssignmentDTO**: API may return `course: {code,name}` while the shared DTO has `courseCode`/`courseName` — component type is `AssignmentDTO & { course?: {code,name} }` and renders `courseCode ?? course.code`.
4. **Results maxMarks**: input labeled "Marks (out of 20)" and validated 0–20 client-side regardless of examType (server fixes maxMarks=20); grade string is computed client-side and sent with each entry.
5. **Hydration safety**: component gates on a client-mount flag (shows PanelLoader during SSR) because greeting/today-lists are date-dependent; `examType` select limited to ct1/ct2/midterm/final per brief.
