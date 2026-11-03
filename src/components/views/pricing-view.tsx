"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, X, Loader2, Sparkles, Building2, Users, GraduationCap } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import type { PlanDTO } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

interface PricingViewProps {
  navigate: (v: "home" | "department" | "login" | "pricing" | "dashboard", params?: Record<string, string>) => void;
}

function formatLimit(n: number): string {
  return n === -1 ? "Unlimited" : n.toLocaleString();
}

export function PricingView({ navigate }: PricingViewProps) {
  const [plans, setPlans] = useState<PlanDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yearly, setYearly] = useState(false);

  useEffect(() => {
    let alive = true;
    apiGet<{ plans: PlanDTO[] }>("/api/portal")
      .then((d) => {
        if (!alive) return;
        setPlans(d.plans);
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
  }, []);

  const recommendedSlug = "standard";

  return (
    <div className="py-6 sm:py-10 max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <Badge className="mb-3 bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-0">
          <Sparkles className="w-3 h-3 mr-1" /> Subscription Plans
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
          Simple, Scalable Pricing
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl mx-auto text-sm sm:text-base">
          Per-university subscription based on departments & students.
          <span className="font-semibold text-violet-700 dark:text-violet-400">
            {" "}
            Currently free for early adopters
          </span>{" "}
          — lock in your institution now.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center gap-1 mt-5 bg-secondary/70 rounded-full p-1 border border-violet-200/40 dark:border-violet-900/40">
          <button
            onClick={() => setYearly(false)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              !yearly
                ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-600/25"
                : "text-muted-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setYearly(true)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              yearly
                ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-600/25"
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
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-stretch">
          {plans.map((plan, idx) => {
            const isRecommended = plan.slug === recommendedSlug;
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
                    <Badge className="bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white border-0 shadow-lg shadow-violet-500/30">
                      ⭐ Most Popular
                    </Badge>
                  </div>
                )}
                <Card
                  className={`h-full rounded-3xl overflow-hidden transition-shadow ${
                    isRecommended
                      ? "border-2 border-violet-500 shadow-xl shadow-violet-500/20"
                      : "hover:shadow-lg"
                  }`}
                >
                  {isRecommended && (
                    <div className="h-1.5 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500" />
                  )}
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg">{plan.name}</h3>
                      {plan.slug === "free" && (
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
                      <Building2 className="w-4 h-4 text-violet-600 shrink-0" />
                      {formatLimit(plan.maxDepartments)} departments
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="w-4 h-4 text-violet-600 shrink-0" />
                      {formatLimit(plan.maxTeachers)} teachers
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <GraduationCap className="w-4 h-4 text-violet-600 shrink-0" />
                      {formatLimit(plan.maxStudents)} students
                    </div>
                    <div className="pt-2 border-t my-2" />
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{f}</span>
                      </div>
                    ))}
                  </CardContent>
                  <CardFooter>
                    <Button
                      className={`w-full h-11 rounded-xl ${
                        isRecommended
                          ? "bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-600 hover:to-fuchsia-700 text-white shadow-lg shadow-violet-500/25"
                          : "bg-violet-600/10 text-violet-700 hover:bg-violet-600/20 dark:text-violet-400"
                      }`}
                      onClick={() => navigate("login")}
                    >
                      {plan.slug === "free" ? "Start Free" : "Request Access"}
                    </Button>
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
