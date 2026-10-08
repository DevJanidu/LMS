"use client";
import { useEffect, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { TrashIcon } from "@/icons";

export default function CalendarDeleteTarget({ ref, area, active }: { ref: RefObject<HTMLDivElement | null>; area: RefObject<HTMLElement | null>; active: boolean }) {
  const t = useTranslations("studyflow");
  const [position, setPosition] = useState({ insetInlineStart: "50%", bottom: "1.5rem" });
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const place = () => {
      const box = area.current?.getBoundingClientRect();
      if (!box) return;
      const center = (Math.max(0, box.left) + Math.min(innerWidth, box.right)) / 2;
      setPosition({ insetInlineStart: `${document.documentElement.dir === "rtl" ? innerWidth - center : center}px`, bottom: `${Math.max(24, innerHeight - Math.min(innerHeight, box.bottom) + 24)}px` });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    const pointer = (event: PointerEvent) => {
      const box = ref.current?.getBoundingClientRect();
      setOver(Boolean(box && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom));
    };
    place(); window.addEventListener("scroll", schedule, true); window.addEventListener("resize", schedule); window.addEventListener("pointermove", pointer);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); window.removeEventListener("pointermove", pointer); setOver(false); };
  }, [active, area, ref]);
  return <div ref={ref} aria-hidden="true" data-active={active} data-hovered={over}
    style={position}
    className="pointer-events-none fixed z-99 flex -translate-x-1/2 translate-y-3 flex-col items-center gap-1 rounded-xl border border-brand-300 bg-brand-50 px-5 py-3 text-brand-700 opacity-0 shadow-theme-lg transition duration-150 data-[active=true]:translate-y-0 data-[active=true]:opacity-100 data-[hovered=true]:scale-105 data-[hovered=true]:border-brand-500 data-[hovered=true]:bg-brand-100 motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:transition-none rtl:translate-x-1/2 dark:border-brand-700 dark:bg-gray-900 dark:text-brand-300 dark:data-[hovered=true]:bg-brand-950">
    <TrashIcon className="size-6" /><span className="text-caption">{t("planner.dropDelete")}</span>
  </div>;
}
