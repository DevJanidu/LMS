"use client";
import { useSyncExternalStore } from "react";
import { deviceTimezone } from "@/lib/timezone";
const serverTimezone = () => undefined;
function subscribe(onChange: () => void) {
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  const timer = setInterval(onChange, 60000);
  return () => {
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
    clearInterval(timer);
  };
}
export default function useDeviceTimezone() {
  return useSyncExternalStore(subscribe, deviceTimezone, serverTimezone);
}
