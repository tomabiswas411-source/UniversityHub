"use client";

/**
 * Shared analytics chart components — Campus Editorial styling.
 * Built on recharts; used by Dept Head, Teacher, Super Admin and
 * Student dashboards. All charts are responsive + mobile-safe and
 * render a friendly empty state when there is nothing to show.
 */

import {
 Area,
 AreaChart,
 Bar,
 BarChart,
 CartesianGrid,
 Cell,
 Legend,
 Line,
 LineChart,
 Pie,
 PieChart,
 ResponsiveContainer,
 Tooltip,
 XAxis,
 YAxis,
} from "recharts";
import { BarChart3, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SectionCard, EmptyState } from "./dashboard-shared";

/* Campus Editorial palette */
export const CHART_COLORS = {
 green: "#2D4F35",
 greenLight: "#4A7C58",
 gold: "#E6B800",
 goldLight: "#FFD60A",
 navy: "#1B3358",
 navyLight: "#3B5578",
 rust: "#C8442E",
 rustLight: "#E55A3F",
 peach: "#E8A87C",
} as const;

export const PIE_PALETTE = [
 CHART_COLORS.green,
 CHART_COLORS.gold,
 CHART_COLORS.navy,
 CHART_COLORS.rust,
 CHART_COLORS.peach,
 CHART_COLORS.greenLight,
];

interface ChartCardProps {
 title: string;
 icon?: LucideIcon;
 action?: React.ReactNode;
 height?: number;
 className?: string;
 children: React.ReactNode;
}

export function ChartCard({
 title,
 icon,
 action,
 height = 260,
 className,
 children,
}: ChartCardProps) {
 return (
 <SectionCard title={title} icon={icon} action={action} className={className}>
 <div style={{ height }} className="w-full">
 {children}
 </div>
 </SectionCard>
 );
}

export function ChartEmpty({ hint }: { hint?: string }) {
 return (
 <EmptyState
 icon={BarChart3}
 title="No data yet"
 hint={hint ?? "Charts will appear here as soon as there is data to analyse."}
 />
 );
}

/* ---------------- Tooltip styling ---------------- */
const tooltipStyle = {
 backgroundColor: "hsl(var(--card, 0 0% 100%))",
 border: "1px solid hsl(var(--border, 220 13% 91%))",
 borderRadius: 10,
 fontSize: 12,
 color: "hsl(var(--foreground, 240 10% 3.5%))",
 boxShadow: "0 4px 16px rgb(0 0 0 / 0.08)",
};

/* ---------------- Horizontal bar (labels on left) ---------------- */
export function HBarChart({
 data,
 color = CHART_COLORS.green,
 hint,
}: {
 data: { label: string; value: number }[];
 color?: string;
 hint?: string;
}) {
 if (data.length === 0) return <ChartEmpty hint={hint} />;
 return (
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
 <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border, 220 13% 91%))" />
 <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
 <YAxis
 type="category"
 dataKey="label"
 width={110}
 tick={{ fontSize: 11 }}
 axisLine={false}
 tickLine={false}
 />
 <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} contentStyle={tooltipStyle} />
 <Bar dataKey="value" name="Count" radius={[0, 6, 6, 0]} maxBarSize={22}>
 {data.map((_, i) => (
 <Cell key={i} fill={i % 2 === 0 ? color : `${color}B3`} />
 ))}
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 );
}

/* ---------------- Vertical bar ---------------- */
export function VBarChart({
 data,
 color = CHART_COLORS.green,
 hint,
 valueLabel = "Value",
}: {
 data: { label: string; value: number }[];
 color?: string;
 hint?: string;
 valueLabel?: string;
}) {
 if (data.length === 0) return <ChartEmpty hint={hint} />;
 return (
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border, 220 13% 91%))" />
 <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
 <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
 <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} contentStyle={tooltipStyle} />
 <Bar dataKey="value" name={valueLabel} radius={[6, 6, 0, 0]} maxBarSize={40} fill={color} />
 </BarChart>
 </ResponsiveContainer>
 );
}

/* ---------------- Area (trend) ---------------- */
export function TrendAreaChart({
 data,
 color = CHART_COLORS.green,
 hint,
 valueLabel = "Value",
}: {
 data: { label: string; value: number }[];
 color?: string;
 hint?: string;
 valueLabel?: string;
}) {
 if (data.length === 0) return <ChartEmpty hint={hint} />;
 return (
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
 <defs>
 <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor={color} stopOpacity={0.35} />
 <stop offset="100%" stopColor={color} stopOpacity={0.02} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border, 220 13% 91%))" />
 <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
 <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
 <Tooltip contentStyle={tooltipStyle} />
 <Area
 type="monotone"
 dataKey="value"
 name={valueLabel}
 stroke={color}
 strokeWidth={2.5}
 fill={`url(#grad-${color.replace("#", "")})`}
 />
 </AreaChart>
 </ResponsiveContainer>
 );
}

/* ---------------- Donut (distribution) ---------------- */
export function DonutChart({
 data,
 hint,
}: {
 data: { label: string; value: number }[];
 hint?: string;
}) {
 const total = data.reduce((acc, d) => acc + d.value, 0);
 if (total === 0) return <ChartEmpty hint={hint} />;
 return (
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={data}
 dataKey="value"
 nameKey="label"
 innerRadius="55%"
 outerRadius="80%"
 paddingAngle={2}
 strokeWidth={0}
 >
 {data.map((_, i) => (
 <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
 ))}
 </Pie>
 <Tooltip contentStyle={tooltipStyle} />
 <Legend
 verticalAlign="bottom"
 height={36}
 iconType="circle"
 iconSize={8}
 formatter={(value) => <span style={{ fontSize: 12 }}>{value}</span>}
 />
 </PieChart>
 </ResponsiveContainer>
 );
}

/* ---------------- Line (multi trend) ---------------- */
export function PerfLineChart({
 data,
 hint,
}: {
 data: { label: string; pct: number }[];
 hint?: string;
}) {
 if (data.length === 0) return <ChartEmpty hint={hint} />;
 return (
 <ResponsiveContainer width="100%" height="100%">
 <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border, 220 13% 91%))" />
 <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
 <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
 <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)}%`, "Average"]} />
 <Line
 type="monotone"
 dataKey="pct"
 stroke={CHART_COLORS.gold}
 strokeWidth={2.5}
 dot={{ r: 4, fill: CHART_COLORS.gold }}
 activeDot={{ r: 6 }}
 />
 </LineChart>
 </ResponsiveContainer>
 );
}

/* ---------------- Animated metric ring (CSS, no chart lib) ---------------- */
export function MetricRing({
 pct,
 label,
 size = 96,
 color = CHART_COLORS.green,
 delay = 0,
}: {
 pct: number;
 label: string;
 size?: number;
 color?: string;
 delay?: number;
}) {
 const clamped = Math.max(0, Math.min(100, pct));
 return (
 <motion.div
 initial={{ opacity: 0, scale: 0.9 }}
 animate={{ opacity: 1, scale: 1 }}
 transition={{ delay, duration: 0.4 }}
 className="flex flex-col items-center gap-1.5"
 >
 <div
 className="relative rounded-full"
 style={{
 width: size,
 height: size,
 background: `conic-gradient(${color} ${clamped * 3.6}deg, hsl(var(--muted, 240 5% 96%)) 0deg)`,
 }}
 >
 <div
 className="absolute inset-[7px] flex items-center justify-center rounded-full bg-card"
 aria-hidden
 >
 <span className="font-display text-lg font-semibold text-heading">
 {Math.round(clamped)}%
 </span>
 </div>
 </div>
 <p className="max-w-[9rem] text-balance text-center text-[11px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
 {label}
 </p>
 </motion.div>
 );
}

/* ---------------- Mini stat pill ---------------- */
export function StatPill({
 label,
 value,
 tone = "green",
 className,
}: {
 label: string;
 value: string | number;
 tone?: "green" | "gold" | "navy" | "rust";
 className?: string;
}) {
 const tones = {
 green: "bg-[#2D4F35]/10 text-[#2D4F35] dark:bg-[#4A7C58]/20 dark:text-[#9CC7AA]",
 gold: "bg-gold/20 text-[#7A6500] dark:bg-gold/15 dark:text-gold",
 navy: "bg-[#1B3358]/10 text-[#1B3358] dark:bg-[#3B5578]/20 dark:text-[#9DB4D6]",
 rust: "bg-[#C8442E]/10 text-[#C8442E] dark:bg-[#C8442E]/20 dark:text-[#F0A08D]",
 };
 return (
 <div className={cn("rounded-xl border bg-card px-3 py-2.5 text-center shadow-sm", className)}>
 <p className="font-display text-xl font-semibold text-heading">{value}</p>
 <p className={cn("mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em]", tones[tone])}>
 {label}
 </p>
 </div>
 );
}
