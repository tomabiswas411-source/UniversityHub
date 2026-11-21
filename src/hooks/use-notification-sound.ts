"use client";

import { useCallback, useRef } from "react";

/**
 * Plays a short notification sound. Audio element is created lazily
 * on first user gesture (browser autoplay policy friendly).
 */
export function useNotificationSound() {
 const audioRef = useRef<HTMLAudioElement | null>(null);

 const play = useCallback(() => {
 try {
 if (typeof window === "undefined") return;
 if (!audioRef.current) {
 audioRef.current = new Audio("/notification.mp3");
 audioRef.current.preload = "auto";
 audioRef.current.volume = 0.6;
 }
 const audio = audioRef.current;
 audio.currentTime = 0;
 audio.play().catch(() => {
 // autoplay blocked until user interaction — ignore silently
 });
 } catch {
 // no-op
 }
 }, []);

 return play;
}

/** Shows a browser notification if permission granted (PWA-friendly).
 *  `link` wires the click to the in-app deep link — without it, clicking
 *  the OS notification did nothing at all (users tap it and nothing opens). */
export function showBrowserNotification(
 title: string,
 body: string,
 link?: string | null
) {
 try {
 if (typeof window === "undefined" || !("Notification" in window)) return;
 if (Notification.permission === "granted") {
 const n = new Notification(title, { body, icon: "/icons/icon-192x192.png" });
 const target = link && link.startsWith("/") ? link : "/?view=dashboard";
 n.onclick = () => {
 try {
 window.focus();
 window.location.assign(target);
 } catch {
 /* noop */
 }
 n.close();
 };
 }
 } catch {
 // no-op
 }
}

/** OS-level notification that also works while the tab is HIDDEN.
 *  D49: routed through the service worker when available (the SW
 *  survives tab-hiding; a page Notification may be suppressed), with
 *  the deep link carried in `data` so sw.js notificationclick opens
 *  the right view. Falls back to the classic page notification. */
export async function showOsNotification(
 title: string,
 body: string,
 link?: string | null
) {
 try {
 if (typeof window === "undefined" || !("Notification" in window)) return;
 if (Notification.permission !== "granted") return;
 const target = link && link.startsWith("/") ? link : "/?view=dashboard";
 if ("serviceWorker" in navigator) {
 const reg = await navigator.serviceWorker.getRegistration();
 if (reg) {
 await reg.showNotification(title, {
 body,
 icon: "/icons/icon-192x192.png",
 badge: "/icons/icon-96x96.png",
 tag: "universityhub-notif",
 data: { link: target },
 });
 return;
 }
 }
 showBrowserNotification(title, body, link);
 } catch {
 // fallback silently — a failed OS notification must never break the app
 }
}

export async function requestNotificationPermission(): Promise<boolean> {
 try {
 if (typeof window === "undefined" || !("Notification" in window))
 return false;
 if (Notification.permission === "granted") return true;
 const res = await Notification.requestPermission();
 return res === "granted";
 } catch {
 return false;
 }
}
