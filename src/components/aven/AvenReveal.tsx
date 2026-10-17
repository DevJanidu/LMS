"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
/**
 * Animates its own height as the content inside changes (a skeleton becoming a card, a
 * card gaining sections), so new content pushes the conversation down smoothly instead
 * of jumping. Content is measured, never clipped once settled; reduced motion disables
 * the transition in CSS.
 */
export default function AvenReveal({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null),
    [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const node = inner.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    setHeight(node.offsetHeight);
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="aven-reveal" style={height === undefined ? undefined : { height }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
