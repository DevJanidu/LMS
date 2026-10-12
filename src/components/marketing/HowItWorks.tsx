import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpIcon, CheckIcon, SparklesIcon } from "@/icons";
import SectionHeading from "./SectionHeading";

function DirectionVisual({ prompt }: { prompt: string }) {
  return (
    <div className="mk-composer">
      <p className="text-small">{prompt}</p>
      <span className="mk-send"><ArrowUpIcon /></span>
    </div>
  );
}

function RoutineVisual({ items }: { items: { time: string; title: string; done: boolean }[] }) {
  return (
    <ul className="grid gap-1.5">
      {items.map((item) => (
        <li key={item.title} className="flex items-center gap-2.5 rounded-lg mk-bg-subtle px-2.5 py-2 text-small">
          <span className="mk-check" data-done={item.done}>{item.done && <CheckIcon />}</span>
          <span className={`min-w-0 flex-1 truncate ${item.done ? "mk-muted line-through" : ""}`}>{item.title}</span>
          <span className="text-caption mk-muted">{item.time}</span>
        </li>
      ))}
    </ul>
  );
}

function ProgressVisual({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="flex items-center gap-4 rounded-lg mk-bg-subtle px-3 py-3">
      <span className="mk-ring" style={{ "--value": 72 } as CSSProperties} data-label="72%" />
      <div>
        <p className="text-caption mk-muted">{label}</p>
        <p className="text-body-strong">{value}</p>
        <p className="text-caption text-success-600 dark:text-success-400">{caption}</p>
      </div>
    </div>
  );
}

export default function HowItWorks() {
  const t = useTranslations("marketing.how");
  return (
    <section id="how-it-works" className="mk-section" aria-labelledby="mk-how-title">
      <div className="mk-container">
        <SectionHeading id="mk-how-title" center eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
        <ol className="mk-how mt-14">
          {(["direction", "routine", "progress"] as const).map((key, index) => (
            <li key={key} className="mk-how-card">
              <div aria-hidden="true" className="min-h-28">
                {key === "direction" && <DirectionVisual prompt={t("direction.visual")} />}
                {key === "routine" && <RoutineVisual items={t.raw("routine.visual") as { time: string; title: string; done: boolean }[]} />}
                {key === "progress" && <ProgressVisual label={t("progress.visualLabel")} value={t("progress.visualValue")} caption={t("progress.visualCaption")} />}
              </div>
              <div>
                <p className="mk-how-num">{t("stepLabel", { step: index + 1 })}</p>
                <h3 className="mt-2 text-h2">{t(`${key}.title`)}</h3>
                <p className="mk-copy mt-2">{t(`${key}.description`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-8 flex items-center justify-center gap-2 text-center text-small mk-muted">
          <SparklesIcon className="size-4 text-brand-500 dark:text-brand-300" />
          {t("avenNote")}
        </p>
      </div>
    </section>
  );
}
