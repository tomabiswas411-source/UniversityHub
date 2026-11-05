"use client";

import { useEffect, useState } from "react";
import { Download, X, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
 prompt: () => Promise<void>;
 userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Registers the service worker, shows a custom "Install App" prompt,
 * and politely asks for browser notification permission once.
 */
export function PwaProvider() {
 const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
 const [showInstall, setShowInstall] = useState(false);

 useEffect(() => {
 // ---- Service worker registration ----
 if ("serviceWorker" in navigator) {
 navigator.serviceWorker.register("/sw.js").catch(() => {});
 }

 // ---- Install prompt capture ----
 const onBeforeInstall = (e: Event) => {
 e.preventDefault();
 setInstallEvent(e as BeforeInstallPromptEvent);
 // show banner only if not previously dismissed
 if (localStorage.getItem("uh-pwa-dismissed") !== "1") setShowInstall(true);
 };
 window.addEventListener("beforeinstallprompt", onBeforeInstall);
 const onInstalled = () => setShowInstall(false);
 window.addEventListener("appinstalled", onInstalled);

 // ---- Ask notification permission after first interaction (once) ----
 if (
 typeof window !== "undefined" &&
 "Notification" in window &&
 Notification.permission === "default" &&
 localStorage.getItem("uh-notif-asked") !== "1"
 ) {
 const ask = () => {
 localStorage.setItem("uh-notif-asked", "1");
 Notification.requestPermission().catch(() => {});
 window.removeEventListener("pointerdown", ask);
 window.removeEventListener("keydown", ask);
 };
 window.addEventListener("pointerdown", ask, { once: true });
 window.addEventListener("keydown", ask, { once: true });
 }

 return () => {
 window.removeEventListener("beforeinstallprompt", onBeforeInstall);
 window.removeEventListener("appinstalled", onInstalled);
 };
 }, []);

 const doInstall = async () => {
 if (!installEvent) return;
 await installEvent.prompt();
 await installEvent.userChoice;
 setInstallEvent(null);
 setShowInstall(false);
 };

 const dismiss = () => {
 localStorage.setItem("uh-pwa-dismissed", "1");
 setShowInstall(false);
 };

 if (!showInstall || !installEvent) return null;

 return (
 <div className="fixed bottom-20 left-1/2 z-50 w-[min(420px,92vw)] -translate-x-1/2 md:bottom-5">
 <div className="glass-card flex items-center gap-3 rounded-2xl p-3 shadow-xl shadow-[#2D4F35]/10">
 <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-white shadow-md">
 <BellRing className="h-5 w-5" />
 </span>
 <div className="min-w-0 flex-1">
 <p className="text-sm font-bold">Install UniversityHub</p>
 <p className="text-xs text-muted-foreground">
 App-like experience · offline shell · instant alerts
 </p>
 </div>
 <Button size="sm" className="h-9 shrink-0 rounded-xl bg-[#2D4F35] text-white hover:bg-[#3A6B47]" onClick={doInstall}>
 <Download className="mr-1 h-4 w-4" /> Install
 </Button>
 <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 rounded-full" onClick={dismiss} aria-label="Dismiss install prompt">
 <X className="h-4 w-4" />
 </Button>
 </div>
 </div>
 );
}
