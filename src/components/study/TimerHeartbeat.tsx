"use client";
import { useEffect } from "react";
import { HEARTBEAT_SECONDS } from "@/lib/circles/policy";

/**
 * While the timer runs, tell the server once a minute that this client is still
 * connected. It proves connection, not attention, and carries no data: the
 * server's clock decides how much verified time a span earns.
 */
export default function TimerHeartbeat({ running }: { running: boolean }) {
  useEffect(() => {
    if (!running) return;
    const beat = () => { void fetch("/api/study/heartbeat", { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => {}); };
    beat();
    const timer = setInterval(beat, HEARTBEAT_SECONDS * 1000);
    window.addEventListener("online", beat);
    document.addEventListener("visibilitychange", beat);
    return () => { clearInterval(timer); window.removeEventListener("online", beat); document.removeEventListener("visibilitychange", beat); };
  }, [running]);
  return null;
}
