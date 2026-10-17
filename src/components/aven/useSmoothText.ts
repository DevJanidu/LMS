"use client";
import { useEffect, useRef, useState } from "react";
/** Time constant for catching up with received text; small bursts appear within a frame or two. */
const CATCH_UP_MS = 120;
/** Next reveal length: a share of the backlog proportional to elapsed time, never a split surrogate pair. */
export function nextRevealLength(
  text: string,
  shown: number,
  elapsedMs: number,
): number {
  const backlog = text.length - shown;
  if (backlog <= 0) return text.length;
  let next = shown + Math.max(1, Math.ceil(backlog * Math.min(1, elapsedMs / CATCH_UP_MS)));
  if (next < text.length) {
    const code = text.charCodeAt(next - 1);
    if (code >= 0xd800 && code <= 0xdbff) next++;
  }
  return Math.min(next, text.length);
}
/**
 * Smooths how received text appears while a reply streams. It only paces text that has
 * already arrived (no artificial typing delay): when streaming ends the full text is
 * returned immediately, a replaced text is shown at once, and reduced motion disables it.
 */
export function useSmoothText(text: string, streaming: boolean) {
  const [length, setLength] = useState(text.length),
    shown = useRef(text.length),
    source = useRef(text);
  useEffect(() => {
    const extends_ = text.startsWith(source.current.slice(0, shown.current));
    source.current = text;
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!streaming || !extends_ || reduced) {
      shown.current = text.length;
      const frame = requestAnimationFrame(() => setLength(text.length));
      return () => cancelAnimationFrame(frame);
    }
    let frame = 0,
      last = performance.now();
    const step = (now: number) => {
      shown.current = nextRevealLength(text, shown.current, now - last);
      last = now;
      setLength(shown.current);
      if (shown.current < text.length) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [text, streaming]);
  return streaming ? text.slice(0, Math.min(length, text.length)) : text;
}
