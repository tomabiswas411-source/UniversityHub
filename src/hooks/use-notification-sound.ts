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

/** Shows a browser notification if permission granted (PWA-friendly). */
export function showBrowserNotification(title: string, body: string) {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icons/icon-192x192.png" });
    }
  } catch {
    // no-op
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
