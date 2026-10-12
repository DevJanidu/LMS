"use client";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
/**
 * Pages contribute contextual sections to the single application sidebar through a portal.
 * State stays with the page (no extra providers or fetching on other routes), while the
 * DOM lives in the sidebar's scrollable middle area.
 */
const SlotContext = createContext<{
  target: HTMLElement | null;
  setTarget: (node: HTMLElement | null) => void;
} | null>(null);
export function SidebarSlotProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return (
    <SlotContext.Provider value={{ target, setTarget }}>
      {children}
    </SlotContext.Provider>
  );
}
/** Ref callback for the sidebar's contextual area. */
export function useSidebarSlotRef() {
  return useContext(SlotContext)?.setTarget;
}
interface Props {
  label: string;
  children: ReactNode;
}
export default function SidebarContextSection({ label, children }: Props) {
  const target = useContext(SlotContext)?.target;
  if (!target) return null;
  return createPortal(
    <section aria-label={label} className="sf-sidebar-section">
      {children}
    </section>,
    target,
  );
}
