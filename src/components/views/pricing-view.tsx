"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, X, Loader2, Sparkles, Building2, Users, GraduationCap, Lock, LayoutDashboard, ArrowLeft } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { GRADIENT_BTN } from "@/components/dashboards/dashboard-shared";
import type { PlanDTO } from "@/types";
import { useAuthStore } from "@/store/auth-store";
import { canSeePricing } from "@/lib/role-access";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
 Card,
 CardContent,
 CardFooter,
 CardHeader,
} from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/role-labels";

interface PricingViewProps {
 navigate: (v: "home" | "department" | "login" | "pricing" | "dashboard", params?: Record<string, string>) => void;
}

function formatLimit(n: number): string {
 return n === -1 ? "Unlimited" : n.toLocaleString();
}

export function PricingView({ navigate }: PricingViewProps) {
 const { user } = useAuthStore();
 const [plans, setPlans] = useState<PlanDTO[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [yearly, setYearly] = useState(false);
 /* bumped by the Retry button to re-run the load in place (no page reload,
    so the Monthly/Yearly toggle survives) */
 const [retryTick, setRetryTick] = useState(0);

 /* Students & teachers never need plans — skip the fetch entirely. */
 const pricingAllowed = canSeePricing(user);

 useEffect(() => {
  if (!pricingAllowed) return;
  let alive = true;
  apiGet<{ plans: PlanDTO[] }>("/api/portal")
 .then((d) => {
 if (!alive) return;
 setPlans(d.plans);
 setError(null);
 setLoading(false);
 })
 .catch((e) => {
 if (!alive) return;
 setError(e instanceof Error ? e.message : "Failed to load plans");
 setLoading(false);
 });
 return () => {
 alive = false;
 };
 }, [pricingAllowed, retryTick]);

 /* Role guard — subscription is a university decision. Students and
    teachers land here only by typing the URL; show a friendly
    explanation instead of a price table. */
 if (!pricingAllowed) {
  return (
   <div className="py-10 sm:py-16 max-w-md mx-auto">
    <motion.div
     initial={{ opacity: 0, y: 16 }}
     animate={{ opacity: 1, y: 0 }}
     className="rounded-3xl border bg-card p-8 text-center shadow-lg"
    >
     <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary shadow-md">
      <Lock className="h-8 w-8 text-green" />
     </div>
     <h1 className="text-xl font-bold">Plans are for universities</h1>
     <p className="mt-2 text-sm text-muted-foreground">
      Subscription plans are chosen by institutions — as{" "}
      <span className="font-semibold text-foreground">
       {user ? ROLE_LABELS[user.role] : "a member"}
      </span>{" "}
      you already have full access to everything your department has
      subscribed to, at no cost to you.
     </p>
     <div className="mt-6 flex flex-col gap-2">
      <Button
       onClick={() => navigate("dashboard")}
       className={cn("h-11 rounded-xl", GRADIENT_BTN)}
      >
       <LayoutDashboard className="w-4 h-4 mr-2" /> Go to Dashboard
      </Button>
      <Button variant="outline" onClick={() => navigate("home")}>
       <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
      </Button>
     </div>
    </motion.div>
   </div>
  );
 }

 const popularSlug =
 plans.find((p) => p.slug === "standard")?.slug ??
 plans.find((p) => (p.priceMonthly ?? 0) > 0)?.slug ??
 plans[0]?.slug;
 /* "Starter" = cheapest plan: prefer a free (৳0) plan, else the lowest-priced. */
 const starterSlug =
 plans.filter((p) => (p.priceMonthly ?? 0) === 0)[0]?.slug ??
 plans.reduce<PlanDTO | null>(
 (min, p) => (min == null || (p.priceMonthly ?? 0) < (min.priceMonthly ?? 0) ? p : min),
 null,
 )?.slug;

 return (
 <div className="py-6 sm:py-10 max-w-6xl mx-auto">
 <motion.div
 initial={{ opacity: 0, y: 16 }}
 animate={{ opacity: 1, y: 0 }}
 className="text-center mb-8"
 >
 <Badge className="mb-3 bg-gold/25 text-ink border-0">
 <Sparkles className="w-3 h-3 mr-1" /> Subscription Plans
 </Badge>
 <h1 className="text-3xl sm:text-4xl font-bold text-ink dark:text-[#EFEDE9]">
 Simple, Scalable Pricing
 </h1>
 <p className="text-muted-foreground mt-2 max-w-xl mx-auto text-sm sm:text-base">
 Per-university subscription based on departments & students.
 <span className="font-semibold text-green">
 {" "}
 Currently free for early adopters
 </span>{" "}
 — lock in your institution now.
 </p>

 {/* Billing toggle */}
 <div className="inline-flex items-center gap-1 mt-5 bg-secondary/70 rounded-full p-1 border border-border ">
 <button
 type="button"
 aria-pressed={!yearly}
 onClick={() => setYearly(false)}
 className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
 !yearly
 ? "bg-[#2D4F35] text-white shadow-md shadow-[#2D4F35]/25"
 : "text-muted-foreground"
 }`}
 >
 Monthly
 </button>
 <button
 type="button"
 aria-pressed={yearly}
 onClick={() => setYearly(true)}
 className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
 yearly
 ? "bg-[#2D4F35] text-white shadow-md shadow-[#2D4F35]/25"
 : "text-muted-foreground"
 }`}
 >
 Yearly <span className="text-[10px] opacity-80">(2 months free)</span>
 </button>
 </div>
 </motion.div>

 {loading && (
 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
 {[...Array(4)].map((_, i) => (
 <Skeleton key={i} className="h-96 rounded-3xl" />
 ))}
 </div>
 )}

 {error && (
 <Card className="max-w-md mx-auto rounded-3xl">
 <CardContent className="pt-6 text-center">
 <p className="text-sm text-muted-foreground mb-4">{error}</p>
 <Button onClick={() => setRetryTick((t) => t + 1)}>Retry</Button>
 </CardContent>
 </Card>
 )}

 {!loading && !error && plans.length === 0 && (
 <Card className="max-w-md mx-auto rounded-3xl">
 <CardContent className="pt-6 pb-6 text-center">
 <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
 <p className="text-base font-bold">No plans published yet</p>
 <p className="mt-1 text-sm text-muted-foreground">
 Subscription plans will appear here once published — early
 adopter institutions currently get in free.
 </p>
 </CardContent>
 </Card>
 )}

 {!loading && !error && plans.length > 0 && (
 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-stretch">
 {plans.map((plan, idx) => {
 const isRecommended = plan.slug === popularSlug;
 const price = yearly ? plan.priceYearly : plan.priceMonthly;
 return (
 <motion.div
 key={plan.id}
 initial={{ opacity: 0, y: 24 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: idx * 0.08 }}
 whileHover={{ y: -4 }}
 className={`relative ${isRecommended ? "md:-translate-y-2" : ""}`}
 >
 {isRecommended && (
 <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
 <Badge className="bg-gold text-ink border-0 shadow-md shadow-[#E6C800]/30">
 ⭐ Most Popular
 </Badge>
 </div>
 )}
 <Card
 className={`h-full rounded-3xl overflow-hidden transition-shadow ${
 isRecommended
 ? "border-2 border-[#2D4F35] shadow-xl shadow-[#2D4F35]/20"
 : "hover:shadow-lg"
 }`}
 >
 {isRecommended && (
 <div className="h-1.5 bg-[#FFE01B]" />
 )}
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <h3 className="font-bold text-lg">{plan.name}</h3>
 {plan.slug === starterSlug && (
 <Badge variant="secondary">Starter</Badge>
 )}
 </div>
 <p className="text-xs text-muted-foreground">
 {plan.tagline}
 </p>
 <div className="pt-3">
 <span className="font-display text-4xl font-extrabold tracking-tight">
 ৳{price === 0 ? "0" : price.toLocaleString()}
 </span>
 <span className="text-sm text-muted-foreground ml-1">
 /{yearly ? "year" : "month"}
 </span>
 </div>
 </CardHeader>
 <CardContent className="space-y-2.5 text-sm">
 <div className="flex items-center gap-2 text-muted-foreground">
 <Building2 className="w-4 h-4 text-green shrink-0" />
 {formatLimit(plan.maxDepartments)} departments
 </div>
 <div className="flex items-center gap-2 text-muted-foreground">
 <Users className="w-4 h-4 text-green shrink-0" />
 {formatLimit(plan.maxTeachers)} teachers
 </div>
 <div className="flex items-center gap-2 text-muted-foreground">
 <GraduationCap className="w-4 h-4 text-green shrink-0" />
 {formatLimit(plan.maxStudents)} students
 </div>
 <div className="pt-2 border-t my-2" />
 {plan.features.map((f) => (
 <div key={f} className="flex items-start gap-2">
 <Check className="w-4 h-4 text-green shrink-0 mt-0.5" />
 <span className="text-muted-foreground">{f}</span>
 </div>
 ))}
 </CardContent>
 <CardFooter>
 {user ? (
 /* Logged-in (staff) visitors don't pick plans here — send them to their dashboard instead */
 <Button
 className={cn("w-full h-11 rounded-xl", GRADIENT_BTN)}
 onClick={() => navigate("dashboard")}
 >
 <LayoutDashboard className="w-4 h-4 mr-2" /> Go to Dashboard
 </Button>
 ) : (
 <Button
 className={`w-full h-11 rounded-xl ${
 isRecommended
 ? GRADIENT_BTN
 : "bg-green/10 text-green hover:bg-green/20"
 }`}
 /* Institutions sign in through the Staff tab — deep-link it so the
    plan CTA never drops a dean on the student login form. */
 onClick={() => navigate("login", { tab: "staff" })}
 >
 {plan.slug === starterSlug ? "Start Free" : "Request Access"}
 </Button>
 )}
 </CardFooter>
 </Card>
 </motion.div>
 );
 })}
 </div>
 )}

 {/* FAQ strip */}
 <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
 {[
 {
 q: "How is billing calculated?",
 a: "Per university, based on departments & students. Simple flat pricing.",
 },
 {
 q: "Is there a free trial?",
 a: "Yes — the entire platform is currently free for early adopter institutions.",
 },
 {
 q: "Can we change plans later?",
 a: "Anytime. Upgrades apply instantly, downgrades at the next cycle.",
 },
 ].map((f) => (
 <Card key={f.q} className="rounded-2xl">
 <CardContent className="p-4">
 <div className="font-semibold text-sm mb-1.5">{f.q}</div>
 <div className="text-xs text-muted-foreground">{f.a}</div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 );
}
