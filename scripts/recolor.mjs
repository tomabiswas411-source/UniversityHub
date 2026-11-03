/* One-shot recolor: Royal Violet → Mailchimp-inspired palette
   Cavendish Yellow #FFE01B · Peppercorn #241C15 · cream #EFEDE9
   Forest green #2D4F35/#3A6B47/#4A7C58 · Navy #1B3358 · Rust #C8442E
   Ordered longest/most-specific first. */
import { readdirSync, statSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(process.cwd(), "src");

const RULES = [
  // ---- gradient text wordmark (must run before generic gradient rules) ----
  ["bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent", "text-ink dark:text-[#EFEDE9]"],
  // ---- big header banners (ink → forest) ----
  ["from-violet-600 via-fuchsia-600 to-violet-600", "from-[#241C15] via-[#2D4F35] to-[#241C15]"],
  ["from-violet-500 via-fuchsia-500 to-violet-500", "from-[#2D4F35] via-[#4A7C58] to-[#2D4F35]"],
  ["from-violet-500 via-violet-600 to-fuchsia-600", "from-[#2D4F35] via-[#3A6B47] to-[#4A7C58]"],
  // ---- hover pairs ----
  ["hover:from-violet-600 hover:to-fuchsia-700", "hover:from-[#233D2A] hover:to-[#3A6B47]"],
  ["from-violet-600 to-fuchsia-700", "from-[#233D2A] to-[#3A6B47]"],
  ["from-violet-700 to-fuchsia-700", "from-[#233D2A] to-[#3A6B47]"],
  // ---- special gradient tiles ----
  ["from-fuchsia-500 to-pink-500", "from-[#C8442E] to-[#E55A3F]"],
  ["from-fuchsia-500 to-fuchsia-700", "from-[#1B3358] to-[#3B5578]"],
  // ---- soft icon wells ----
  ["from-violet-500/15 to-fuchsia-600/15", "from-[#2D4F35]/12 to-[#4A7C58]/12"],
  ["dark:from-violet-500/20 dark:to-fuchsia-600/20", "dark:from-[#4A7C58]/22 dark:to-[#4A7C58]/22"],
  // ---- primary brand gradient — unify to forest green ----
  ["from-violet-500 to-fuchsia-600", "from-[#2D4F35] to-[#4A7C58]"],
  ["from-violet-600 to-fuchsia-600", "from-[#2D4F35] to-[#4A7C58]"],
  ["from-violet-500 to-fuchsia-500", "from-[#2D4F35] to-[#4A7C58]"],
  // ---- SectionCard icon well ----
  ["from-violet-100 to-fuchsia-100 dark:from-violet-950/60 dark:to-fuchsia-950/60", "from-gold/25 to-gold/5 dark:from-gold/15 dark:to-gold/5"],
  // ---- timetable today header ----
  ["from-violet-100 to-fuchsia-100 text-violet-700 dark:from-violet-950/60 dark:to-fuchsia-950/40 dark:text-violet-200", "from-gold/30 to-gold/10 text-[#7A6500] dark:from-gold/15 dark:to-gold/10 dark:text-gold"],
  // ---- chips (most common combos first) ----
  ["bg-violet-100 font-mono text-violet-700 dark:bg-violet-950/50 dark:text-violet-300", "bg-green/10 font-mono text-green"],
  ["bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300", "bg-green/10 text-green"],
  ["bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300", "bg-gold/25 text-ink"],
  ["bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300", "bg-navy/10 text-navy dark:text-[#9DB4D6]"],
  ["bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-900/70", "bg-navy/10 text-navy dark:text-[#9DB4D6] border-navy/25"],
  // ---- department-view notice palettes ----
  ["bg-violet-50/80 dark:bg-violet-950/40 border-violet-200/80 dark:border-violet-800/60", "bg-green/[0.07] border-green/25"],
  ["text-violet-800 dark:text-violet-200", "text-heading"],
  ["text-violet-700/80 dark:text-violet-300/80", "text-green/80"],
  ["bg-fuchsia-50/80 dark:bg-fuchsia-950/40 border-fuchsia-200/80 dark:border-fuchsia-800/60", "bg-gold/20 border-gold/60"],
  ["text-fuchsia-800 dark:text-fuchsia-200", "text-ink dark:text-gold"],
  ["text-fuchsia-700/80 dark:text-fuchsia-300/80", "text-ink/70 dark:text-gold/80"],
  ["bg-purple-50/80 dark:bg-purple-950/40 border-purple-200/80 dark:border-purple-800/60", "bg-navy/[0.07] border-navy/25"],
  ["text-purple-800 dark:text-purple-200", "text-navy dark:text-[#9DB4D6]"],
  ["text-purple-700/80 dark:text-purple-300/80", "text-navy/80 dark:text-[#9DB4D6]/80"],
  // ---- hover combos ----
  ["hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-950/40 dark:hover:text-violet-300", "hover:bg-green/10 hover:text-green"],
  ["hover:bg-violet-100/60 hover:text-violet-700 dark:hover:bg-violet-900/40 dark:hover:text-violet-300", "hover:bg-green/10 hover:text-green"],
  ["hover:text-violet-700 hover:bg-violet-500/10 dark:hover:text-violet-300 dark:hover:bg-violet-400/10", "hover:text-green hover:bg-green/10"],
  ["bg-violet-600/10 text-violet-700 hover:bg-violet-600/20 dark:text-violet-400", "bg-green/10 text-green hover:bg-green/20"],
  ["hover:text-violet-600 dark:hover:text-violet-300", "hover:text-green"],
  ["hover:text-violet-700 transition-colors", "hover:text-green transition-colors"],
  ["hover:bg-violet-500/10", "hover:bg-green/10"],
  ["hover:bg-violet-100", "hover:bg-green/10"],
  ["hover:bg-violet-600/20", "hover:bg-green/20"],
  ["hover:border-violet-300", "hover:border-[#4A7C58]/70"],
  ["hover:border-violet-200", "hover:border-[#4A7C58]/50"],
  // ---- selected university card ----
  ["border-violet-400 shadow-lg shadow-violet-500/20 ring-2 ring-violet-500 dark:border-violet-600", "border-[#2D4F35] shadow-lg shadow-[#2D4F35]/20 ring-2 ring-[#2D4F35] dark:border-[#4A7C58]"],
  // ---- glows behind logo squares ----
  ["bg-violet-500/25 blur-md transition-colors group-hover:bg-violet-500/40", "bg-gold/40 blur-md transition-colors group-hover:bg-gold/60"],
  ["bg-violet-500/25 blur-md", "bg-gold/40 blur-md"],
  ["bg-violet-500/25 blur-xl", "bg-gold/40 blur-xl"],
  ["bg-violet-500/20 blur-2xl", "bg-gold/40 blur-2xl"],
  ["group-hover:bg-violet-500/40", "group-hover:bg-gold/60"],
  ["bg-violet-400/20 blur-3xl dark:bg-violet-500/10", "bg-gold/25 blur-3xl dark:bg-gold/10"],
  ["bg-fuchsia-400/15 blur-3xl dark:bg-fuchsia-500/10", "bg-[#4A7C58]/15 blur-3xl dark:bg-[#4A7C58]/10"],
  ["bg-violet-400/40 dark:bg-violet-600/20", "bg-gold/35 dark:bg-gold/20"],
  // ---- today column / unread tints ----
  ["bg-violet-50/70 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300", "bg-gold/20 text-[#7A6500] dark:bg-gold/15 dark:text-gold"],
  ["bg-violet-50/60 dark:bg-violet-950/25", "bg-gold/15"],
  ["bg-violet-50/50 dark:bg-violet-950/20", "bg-gold/10"],
  ["bg-violet-50/40 dark:bg-violet-950/20", "bg-green/[0.04]"],
  ["bg-violet-50/60", "bg-gold/15"],
  ["bg-violet-50/70", "bg-gold/20"],
  ["bg-violet-100/80", "bg-green/10"],
  ["bg-violet-50/80", "bg-gold/20"],
  // ---- borders → warm hairline ----
  ["dark:sm:border-violet-900/50", ""],
  ["border-violet-100/80", "border-border"],
  ["border-violet-200/80", "border-border"],
  ["border-violet-200/70", "border-border"],
  ["border-violet-200/60", "border-border"],
  ["border-violet-200/50", "border-border"],
  ["border-violet-200/40", "border-border"],
  ["border-violet-100", "border-border"],
  ["border-violet-200", "border-border"],
  ["border-violet-300", "border-border"],
  ["border-purple-100/80", "border-border"],
  ["border-purple-200", "border-border"],
  ["border-violet-500/60", "border-[#2D4F35]/50"],
  ["border-violet-500/40", "border-[#2D4F35]/45"],
  ["border-violet-500", "border-[#2D4F35]"],
  ["border-violet-400", "border-[#2D4F35]"],
  // ---- footer canvas ----
  ["from-violet-50/80 to-violet-100/60 dark:from-violet-950/30 dark:to-violet-900/20", "from-secondary to-background dark:from-[#241C15] dark:to-[#1A1612]"],
  // ---- super-admin promo field ----
  ["from-violet-50 to-fuchsia-50", "from-gold/20 to-gold/5"],
  ["dark:from-violet-950/40 dark:to-fuchsia-950/40", "dark:from-gold/10 dark:to-gold/5"],
  // ---- page.tsx canvas tint ----
  ["from-violet-50/60", "from-gold/20"],
  // ---- teacher scrollbar ----
  ["bg-violet-300/70 dark:bg-violet-800/60", "bg-[#2D4F35]/30 dark:bg-[#4A7C58]/40"],
  // ---- text pairs ----
  ["text-violet-600 dark:text-violet-400", "text-green"],
  ["text-violet-700 dark:text-violet-300", "text-green"],
  ["text-violet-700 dark:text-violet-400", "text-green"],
  ["text-violet-800 dark:text-violet-300", "text-green"],
  ["text-purple-700 dark:text-purple-300", "text-navy dark:text-[#9DB4D6]"],
  ["text-purple-500", "text-rust"],
  ["text-violet-600", "text-green"],
  ["text-violet-700", "text-green"],
  ["text-violet-800", "text-heading"],
  ["text-violet-900", "text-heading"],
  // ---- generic backgrounds ----
  ["bg-violet-100", "bg-green/10"],
  ["bg-violet-50", "bg-gold/10"],
  ["bg-violet-500", "bg-green"],
  ["bg-purple-100", "bg-navy/10"],
  ["bg-fuchsia-100", "bg-gold/25"],
  // ---- shadows ----
  ["shadow-violet-500", "shadow-[#2D4F35]"],
  ["shadow-violet-600", "shadow-[#2D4F35]"],
  // ---- rings ----
  ["ring-violet-500", "ring-[#2D4F35]"],
  ["ring-violet-600", "ring-[#2D4F35]"],
];

const CLEANUP = [
  /dark:(text|bg|border|from|to|via|ring|fill|stroke|decoration)-(?:violet|fuchsia|purple)-[\w/.\[\]#]*/g,
  /dark:(hover|focus|focus-visible|group-hover|sm|md|lg):(text|bg|border|from|to|via|ring)-(?:violet|fuchsia|purple)-[\w/.\[\]#]*/g,
  /dark:sm:border-(?:violet|fuchsia|purple)-[\w/.\[\]#]*/g,
];

function walk(dir) {
  let files = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) files.push(...walk(p));
    else if (/\.(tsx?|ts)$/.test(name)) files.push(p);
  }
  return files;
}

let totalReplacements = 0;
const changedFiles = [];
for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  let out = src;
  let count = 0;
  for (const [from, to] of RULES) {
    let idx = 0;
    while ((idx = out.indexOf(from, idx)) !== -1) {
      count++;
      idx += to.length || 1;
    }
    out = out.split(from).join(to);
  }
  for (const re of CLEANUP) {
    out = out.replace(re, () => {
      count++;
      return "";
    });
  }
  // collapse double spaces left by deletions (only inside className strings is fine globally)
  out = out.replace(/ {2,}/g, " ");
  if (out !== src) {
    writeFileSync(file, out);
    totalReplacements += count;
    changedFiles.push(`${file} (${count})`);
  }
}
console.log(`Total replacements: ${totalReplacements}`);
console.log(changedFiles.join("\n"));
