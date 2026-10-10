"use client";
import { useEffect, useState } from "react";

/** Reconcile the visible list on focus/reconnect and at a bounded background cadence. */
export default function useQueryRefresh() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setRevision(value => value + 1); };
    const interval = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh);
    return () => { clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
  }, []);
  return revision;
}
