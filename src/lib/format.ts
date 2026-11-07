/**
 * Shared formatting helpers — one implementation each for relative time,
 * avatar initials and grade tones. Previously these were copy-pasted per
 * component with divergent output ("5m ago" vs "5 min ago", "AR" vs "RR").
 */

/** "5m ago" / "3h ago" / "2d ago" style relative time from an ISO string. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Initials for avatar monograms: "Dr. A. Rahman" → "AR".
 * Skips honorifics, uses first + last significant token.
 */
export function initials(name: string): string {
  const clean = name
    .replace(/^(dr|prof|md|mr|ms|mrs|eng)\.?\s+/i, "")
    .trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Consistent grade/percentage tone — one color scheme across teacher
 * entry sheets, published results and student performance cards.
 */
export function gradeTone(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) {
    return "bg-muted text-muted-foreground";
  }
  if (pct >= 80) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
  if (pct >= 60) return "bg-green/10 text-green dark:bg-green/15";
  if (pct >= 40) return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
  return "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300";
}

/** Letter grade → matching tone (A grades green family, C/D muted-red). */
export function letterTone(grade: string | null | undefined): string {
  switch ((grade ?? "").toUpperCase()) {
    case "A+":
    case "A":
    case "A-":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
    case "B":
    case "B+":
    case "B-":
      return "bg-green/10 text-green dark:bg-green/15";
    case "C":
    case "C+":
    case "D":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
    case "F":
      return "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}
