"use client";

/**
 * ScanView — in-app QR scanner (`/?view=scan`).
 *
 * Students previously had to exit the app and use their phone's camera
 * app to scan the teacher's attendance QR. This view scans INSIDE the
 * platform: live camera preview + on-device decoding (jsQR, ~38 KB,
 * runs 100% locally — no frames ever leave the phone).
 *
 * FLOW: decode → extract the token (raw 32-hex or a full attend URL)
 * → vibrate + navigate to `/?view=attend&k=<token>` which handles
 * geolocation + login + marking present.
 *
 * COST GUARD: zero network requests while scanning — decode is local;
 * only the final navigation triggers the two tiny attend-view calls.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { motion } from "framer-motion";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Keyboard,
  Loader2,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppView } from "@/app/page";

type CamState = "idle" | "starting" | "scanning" | "denied" | "unavailable";

/** Pull the 32-hex attendance token out of a scanned string. */
function extractToken(text: string): string | null {
  const trimmed = text.trim();
  // Full URL form: /?view=attend&k=<token> (any host)
  const kMatch = trimmed.match(/[?&]k=([A-Za-z0-9]+)/);
  if (kMatch) return kMatch[1];
  // Raw token
  if (/^[a-f0-9]{32}$/i.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

export function ScanView({
  navigate,
}: {
  navigate: (v: AppView, params?: Record<string, string>) => void;
}) {
  const user = useAuthStore((s) => s.user);

  const [camState, setCamState] = useState<CamState>("idle");
  const [manual, setManual] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const navigatingRef = useRef(false);

  const stopCamera = useCallback(() => {
    stoppedRef.current = true;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const goToToken = useCallback(
    (token: string) => {
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      stopCamera();
      try {
        navigator.vibrate?.(80);
      } catch {
        /* vibration unsupported — fine */
      }
      toast({
        title: "QR detected",
        description: "Opening your check-in page…",
      });
      navigate("attend", { k: token });
    },
    [navigate, stopCamera]
  );

  const startCamera = useCallback(async () => {
    if (camState === "starting" || camState === "scanning") return;
    setLastError(null);
    stoppedRef.current = false;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCamState("unavailable");
      return;
    }

    setCamState("starting");
    // Prefer the rear camera (phones); fall back to any camera (laptops).
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: true },
    ];

    let stream: MediaStream | null = null;
    for (const constraints of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setCamState("denied");
          return;
        }
        // try the next constraint set
      }
    }

    if (!stream) {
      setCamState("unavailable");
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) {
      stream.getTracks().forEach((t) => t.stop());
      setCamState("unavailable");
      return;
    }
    video.srcObject = stream;
    video.setAttribute("playsinline", "true"); // iOS Safari full-screen prevention
    try {
      await video.play();
    } catch {
      /* autoplay policies — the poster frame + retry button cover this */
    }
    setCamState("scanning");

    // Decode loop — grab a frame every 180 ms; cheap on modern phones.
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    timerRef.current = window.setInterval(() => {
      if (stoppedRef.current || navigatingRef.current) return;
      const v = videoRef.current;
      if (!v || v.readyState < 2) return;
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!w || !h) return;
      // decode at most 480px on the long edge — plenty for QR, kind to CPU
      const scale = Math.min(1, 480 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
      if (code?.data) {
        const token = extractToken(code.data);
        if (token) {
          goToToken(token);
        } else {
          setLastError("This is a QR code, but not a UniversityHub attendance code.");
        }
      }
    }, 180);
  }, [camState, goToToken]);

  /* Auto-start once on mount; always release the camera on unmount.
     The start is deferred by a tick so no setState runs synchronously
     inside the effect body (React 19 cascading-render guard). */
  useEffect(() => {
    const t = window.setTimeout(() => void startCamera(), 0);
    return () => {
      window.clearTimeout(t);
      stopCamera();
    };
    // startCamera/stopCamera are stable per mount by construction
  }, []);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const token = extractToken(manual);
    if (!token) {
      toast({
        title: "Not a valid code",
        description: "Paste the full link from your teacher or the code under the QR.",
        variant: "destructive",
      });
      return;
    }
    goToToken(token);
  };

  const isStudent = user?.role === "student";

  return (
    <div className="mx-auto max-w-lg space-y-5 py-2">
      {/* header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl border bg-card shadow-sm"
      >
        <div className="bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] px-5 py-4 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-80">
            Attendance check-in
          </p>
          <h1 className="font-display text-2xl leading-tight">Scan QR</h1>
          <p className="text-sm opacity-90">
            Point your camera at the code your teacher shows in class.
          </p>
        </div>
      </motion.div>

      {/* camera card */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="relative aspect-[4/3] w-full bg-[#0F0C08]">
          <video
            ref={videoRef}
            muted
            playsInline
            className={cn(
              "h-full w-full object-cover",
              camState !== "scanning" && "opacity-0"
            )}
            aria-label="Camera preview for QR scanning"
          />
          <canvas ref={canvasRef} className="hidden" aria-hidden />

          {/* scan frame overlay */}
          {camState === "scanning" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
              <div className="relative h-52 w-52 sm:h-60 sm:w-60">
                <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-xl border-l-4 border-t-4 border-[#FFE01B]" />
                <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-xl border-r-4 border-t-4 border-[#FFE01B]" />
                <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-xl border-b-4 border-l-4 border-[#FFE01B]" />
                <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-xl border-b-4 border-r-4 border-[#FFE01B]" />
                <motion.span
                  className="absolute left-3 right-3 h-0.5 bg-[#FFE01B]/90 shadow-[0_0_12px_rgba(255,224,27,0.8)]"
                  animate={{ top: ["12%", "86%", "12%"] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
            </div>
          )}

          {/* non-scanning states */}
          {camState !== "scanning" && (
            <div
              aria-live="polite"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
            >
              {camState === "starting" && (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-[#FFE01B]" />
                  <p className="text-sm font-medium text-white/85">Starting camera…</p>
                </>
              )}
              {camState === "idle" && (
                <>
                  <Camera className="h-8 w-8 text-[#FFE01B]" />
                  <Button
                    onClick={() => void startCamera()}
                    className="bg-[#FFE01B] text-[#241C15] hover:bg-[#FFE84D] font-bold"
                  >
                    <Camera className="mr-2 h-4 w-4" /> Start camera
                  </Button>
                </>
              )}
              {camState === "denied" && (
                <>
                  <CameraOff className="h-9 w-9 text-[#E55A3F]" />
                  <p className="text-sm font-bold text-white">Camera blocked</p>
                  <p className="max-w-xs text-xs text-white/70">
                    Allow camera access for this site (tap the 🔒 icon in the address bar),
                    then try again. You can also paste the code below.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void startCamera()}
                    className="border-white/25 bg-white/10 text-white hover:bg-white/20"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" /> Try again
                  </Button>
                </>
              )}
              {camState === "unavailable" && (
                <>
                  <CameraOff className="h-9 w-9 text-[#E55A3F]" />
                  <p className="text-sm font-bold text-white">No camera available</p>
                  <p className="max-w-xs text-xs text-white/70">
                    This device or browser cannot open a camera. Use the manual code box below,
                    or scan with your phone&apos;s camera app instead.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* status strip */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-semibold text-[#2D4F35] dark:text-[#7FB08F]">
            <ShieldCheck className="h-3.5 w-3.5" /> Scans stay on your device
          </span>
          <span className="inline-flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 text-amber-500" /> Auto-opens the check-in page
          </span>
          {isStudent && (
            <span className="ml-auto inline-flex items-center gap-1 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Student mode
            </span>
          )}
        </div>
      </div>

      {lastError && (
        <p className="rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {lastError}
        </p>
      )}

      {/* manual fallback */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <Keyboard className="h-4 w-4 text-[#2D4F35] dark:text-[#7FB08F]" />
          Can&apos;t scan? Enter the code
        </p>
        <p className="mb-3 text-xs text-muted-foreground">
          Paste the check-in link your teacher shared (or the 32-character code) and continue.
        </p>
        <form onSubmit={submitManual} className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="scan-manual" className="sr-only">
              Check-in code or link
            </Label>
            <Input
              id="scan-manual"
              placeholder="e.g. https://…/?view=attend&k=…  or  9f2c…"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <Button type="submit" className="btn-shine bg-[#2D4F35] hover:bg-[#3A6B47] text-white shadow-md shadow-[#2D4F35]/25">
            <ScanLine className="mr-2 h-4 w-4" /> Open check-in
          </Button>
        </form>
      </div>

      {/* guidance for staff / visitors */}
      {!isStudent && (
        <div className="rounded-2xl border border-[#1B3358]/20 bg-[#1B3358]/5 p-4 text-xs dark:border-[#9DB4D6]/25 dark:bg-[#1B3358]/15">
          <p className="font-bold text-[#1B3358] dark:text-[#9DB4D6]">
            {user ? "You are signed in as staff" : "Not signed in as a student?"}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            QR self check-in marks <span className="font-semibold">student</span> attendance.
            {user
              ? " Students scan this code from their own account; teachers open the QR from the Attendance tab of the dashboard."
              : " After scanning you will land on the check-in page, where you can log in with your Student ID and Roll number."}
          </p>
        </div>
      )}
    </div>
  );
}
