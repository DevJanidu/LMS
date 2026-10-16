"use client";
import { useLayoutEffect, useState, type RefObject } from "react";
const GAP = 8,
  PREFERRED = 360,
  MINIMUM = 160;
/**
 * Opens above the composer when there is room (the usual case for a docked composer),
 * otherwise below, and caps the height to the space actually visible, including when
 * a mobile keyboard shrinks the visual viewport.
 */
export function placeMenu(rect: { top: number; bottom: number }, viewportHeight: number) {
  const above = rect.top - GAP,
    below = viewportHeight - rect.bottom - GAP;
  const side: "top" | "bottom" = above >= Math.min(PREFERRED, MINIMUM * 1.5) || above >= below ? "top" : "bottom";
  return { side, maxHeight: Math.max(MINIMUM, Math.min(PREFERRED, side === "top" ? above : below)) };
}
export function useMenuPlacement(anchor: RefObject<HTMLElement | null>, open: boolean) {
  const [placement, setPlacement] = useState<ReturnType<typeof placeMenu>>({ side: "top", maxHeight: PREFERRED });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const next = placeMenu(rect, window.visualViewport?.height ?? window.innerHeight);
      setPlacement((current) =>
        current.side === next.side && current.maxHeight === next.maxHeight ? current : next,
      );
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, open]);
  return placement;
}
