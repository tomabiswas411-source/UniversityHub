"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
 GraduationCap,
 ShieldCheck,
 Loader2,
 Mail,
 Lock,
 IdCard,
 Hash,
 Building2,
 Eye,
 EyeOff,
 ArrowLeft,
 BadgeCheck,
} from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { apiGet, apiPost } from "@/lib/api-client";
import { GRADIENT_BTN } from "@/components/dashboards/dashboard-shared";
import type { SessionUser, UniversityDTO } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";

interface LoginViewProps {
 navigate: (v: "home" | "department" | "login" | "pricing" | "dashboard", params?: Record<string, string>) => void;
}

export function LoginView({ navigate }: LoginViewProps) {
 const { user, setUser } = useAuthStore();
 const [universities, setUniversities] = useState<UniversityDTO[]>([]);
 const [staffLoading, setStaffLoading] = useState(false);
 const [studentLoading, setStudentLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [showPassword, setShowPassword] = useState(false);
 /* students are the majority — open on the Student tab */
 const [tab, setTab] = useState("student");
 const [uniError, setUniError] = useState<string | null>(null);
 const [uniLoading, setUniLoading] = useState(true);

 // staff form
 const [email, setEmail] = useState("");
 const [password, setPassword] = useState("");

 // student form
 const [uniSlug, setUniSlug] = useState("");
 const [studentId, setStudentId] = useState("");
 const [roll, setRoll] = useState("");

 const loadUniversities = useCallback(() => {
 setUniError(null);
 setUniLoading(true);
 apiGet<{ universities: UniversityDTO[] }>("/api/portal")
 .then((d) => {
 setUniversities(d.universities);
 if (d.universities.length > 0) {
 setUniSlug((prev) => prev || d.universities[0].slug);
 }
 })
 .catch(() => {
 setUniError("Couldn't load universities. Check your connection and retry.");
 })
 .finally(() => setUniLoading(false));
 }, []);

 useEffect(() => {
 loadUniversities();
 }, [loadUniversities]);

 async function staffLogin(e: React.FormEvent) {
 e.preventDefault();
 setError(null);
 setStaffLoading(true);
 try {
 const res = await apiPost<{ user: SessionUser }>("/api/auth/login", {
 email: email.trim(),
 password,
 });
 /* res.user is already typed as SessionUser via the apiPost generic —
    the value passes to the store (SessionUser | null) with no cast. */
 setUser(res.user);
 navigate("dashboard");
 } catch (err) {
 setError(err instanceof Error ? err.message : "Login failed");
 } finally {
 setStaffLoading(false);
 }
 }

 async function studentLogin(e: React.FormEvent) {
 e.preventDefault();
 setError(null);
 setStudentLoading(true);
 try {
 const res = await apiPost<{ user: SessionUser }>(
 "/api/auth/student-login",
 {
 universitySlug: uniSlug,
 studentIdNumber: studentId.trim(),
 rollNumber: roll.trim(),
 }
 );
 setUser(res.user);
 navigate("dashboard");
 } catch (err) {
 setError(err instanceof Error ? err.message : "Login failed");
 } finally {
 setStudentLoading(false);
 }
 }

 return (
 <div className="max-w-md mx-auto py-6 sm:py-10">
 {user ? (
 <motion.div
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 className="text-center bg-card rounded-3xl border p-8 shadow-lg"
 >
 <div className="w-16 h-16 mx-auto rounded-2xl bg-[#241C15] flex items-center justify-center shadow-lg shadow-[#241C15]/25 mb-4">
 <BadgeCheck className="w-8 h-8 text-[#FFE01B]" />
 </div>
 <h1 className="text-xl font-bold mb-1">Already logged in</h1>
 <p className="text-sm text-muted-foreground mb-6">
 You are signed in as <span className="font-semibold">{user.fullName}</span>
 </p>
 <div className="flex flex-col gap-2">
 <Button
 onClick={() => navigate("dashboard")}
 className={GRADIENT_BTN}
 >
 Go to Dashboard
 </Button>
 <Button variant="outline" onClick={() => navigate("home")}>
 <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
 </Button>
 </div>
 </motion.div>
 ) : (
 <>
 <motion.div
 initial={{ opacity: 0, y: 16 }}
 animate={{ opacity: 1, y: 0 }}
 className="text-center mb-6"
 >
 <div className="relative w-fit mx-auto mb-4">
 <div className="absolute inset-0 rounded-2xl bg-gold/50 blur-xl" />
 <div className="relative w-16 h-16 rounded-2xl bg-[#241C15] flex items-center justify-center shadow-xl shadow-[#241C15]/25">
 <GraduationCap className="w-8 h-8 text-[#FFE01B]" />
 </div>
 </div>
 <h1 className="text-2xl font-bold">Login Portal</h1>
 <p className="text-sm text-muted-foreground mt-1">
 Sign in to your department or student dashboard
 </p>
 </motion.div>

 <motion.div
 initial={{ opacity: 0, y: 16 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.08 }}
 className="bg-card rounded-3xl border shadow-xl overflow-hidden"
 >
 <div className="h-1.5 bg-[#FFE01B]" />
 <div className="p-5 sm:p-6">
 {error && (
 <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
 {error}
 </div>
 )}

 <Tabs value={tab} onValueChange={(v) => { setTab(v); setError(null); }}>
 <TabsList className="grid grid-cols-2 w-full mb-5">
 <TabsTrigger value="student" className="gap-1.5">
 <GraduationCap className="w-4 h-4" /> Student
 </TabsTrigger>
 <TabsTrigger value="staff" className="gap-1.5">
 <ShieldCheck className="w-4 h-4" /> Staff
 </TabsTrigger>
 </TabsList>

 {/* -------- Staff login -------- */}
 <TabsContent value="staff">
 <form onSubmit={staffLogin} className="space-y-4">
 <div className="space-y-2">
 <Label htmlFor="email">Email</Label>
 <div className="relative">
 <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
 <Input
 id="email"
 type="email"
 required
 placeholder="you@university.edu"
 className="pl-9 h-11"
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 />
 </div>
 </div>
 <div className="space-y-2">
 <Label htmlFor="password">Password</Label>
 <div className="relative">
 <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
 <Input
 id="password"
 type={showPassword ? "text" : "password"}
 required
 placeholder="••••••••"
 className="pl-9 pr-10 h-11"
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 />
 <button
 type="button"
 onClick={() => setShowPassword((s) => !s)}
 className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
 aria-label={showPassword ? "Hide password" : "Show password"}
 >
 {showPassword ? (
 <EyeOff className="w-4 h-4" />
 ) : (
 <Eye className="w-4 h-4" />
 )}
 </button>
 </div>
 </div>
 <Button
 type="submit"
 disabled={staffLoading}
 className={`w-full h-11 ${GRADIENT_BTN}`}
 >
 {staffLoading ? (
 <Loader2 className="w-4 h-4 animate-spin mr-2" />
 ) : (
 <ShieldCheck className="w-4 h-4 mr-2" />
 )}
 Sign In as Staff
 </Button>
 <p className="text-xs text-center text-muted-foreground">
 Super Admin · Department Head · Teacher
 </p>
 </form>
 </TabsContent>

 {/* -------- Student login -------- */}
 <TabsContent value="student">
 <form onSubmit={studentLogin} className="space-y-4">
 <div className="space-y-2">
 <Label htmlFor="university-select">University</Label>
 <Select value={uniSlug} onValueChange={setUniSlug} required>
 {uniLoading ? (
 <SelectTrigger id="university-select" className="h-11" disabled aria-busy="true">
 <Loader2 className="w-4 h-4 mr-2 animate-spin text-muted-foreground" />
 <span className="text-muted-foreground">Loading universities…</span>
 </SelectTrigger>
 ) : (
 <SelectTrigger id="university-select" className="h-11">
 <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
 <SelectValue placeholder="Select your university" />
 </SelectTrigger>
 )}
 <SelectContent>
 {universities.map((u) => (
 <SelectItem key={u.id} value={u.slug}>
 {u.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 {uniError && (
 <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
 <span>{uniError}</span>
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="h-7 shrink-0 px-2 text-xs"
 onClick={loadUniversities}
 disabled={uniLoading}
 >
 {uniLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Retry"}
 </Button>
 </div>
 )}
 <div className="space-y-2">
 <Label htmlFor="sid">ID Number</Label>
 <div className="relative">
 <IdCard className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
 <Input
 id="sid"
 required
 inputMode="numeric"
 autoComplete="off"
 placeholder="e.g. 2103001"
 className="pl-9 h-11"
 value={studentId}
 onChange={(e) => setStudentId(e.target.value)}
 />
 </div>
 </div>
 <div className="space-y-2">
 <Label htmlFor="roll">Roll Number</Label>
 <div className="relative">
 <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
 <Input
 id="roll"
 required
 inputMode="numeric"
 autoComplete="off"
 placeholder="e.g. 05"
 className="pl-9 h-11"
 value={roll}
 onChange={(e) => setRoll(e.target.value)}
 />
 </div>
 </div>
 <Button
 type="submit"
 disabled={studentLoading || !uniSlug}
 className={`w-full h-11 ${GRADIENT_BTN}`}
 >
 {studentLoading ? (
 <Loader2 className="w-4 h-4 animate-spin mr-2" />
 ) : (
 <GraduationCap className="w-4 h-4 mr-2" />
 )}
 Sign In as Student
 </Button>
 <p className="text-xs text-center text-muted-foreground">
 Use the ID Number & Roll Number given by your department
 </p>
 </form>
 </TabsContent>
 </Tabs>
 </div>
 </motion.div>

 <div className="mt-5 text-center">
 <Badge variant="outline" className="text-xs border-border text-green">
 <Lock className="w-3 h-3 mr-1" /> Sessions are encrypted &amp; httpOnly-secured
 </Badge>
 </div>
 </>
 )}
 </div>
 );
}
