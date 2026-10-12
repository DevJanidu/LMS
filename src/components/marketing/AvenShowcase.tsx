import { useTranslations } from "next-intl";
import { BellIcon, CheckIcon, SparklesIcon, TimeIcon } from "@/icons";
import SectionHeading from "./SectionHeading";
import AvenDemo from "./AvenDemo";

function AvenMark({ small = false }: { small?: boolean }) {
  return <span className={`mk-aven-mark ${small ? "mk-aven-mark-sm" : ""}`}><SparklesIcon /></span>;
}

function ConversationVisual() {
  const c = useTranslations("marketing.aven.conversation");
  return (
    <div className="mk-capability-visual">
      <p className="mk-bubble mk-bubble-user">{c("user")}</p>
      <div className="flex items-end gap-2">
        <AvenMark small />
        <p className="mk-bubble mk-bubble-aven">{c("aven")}</p>
      </div>
    </div>
  );
}

function PlanningVisual() {
  const pl = useTranslations("marketing.aven.planning");
  const milestones = pl.raw("milestones") as string[];
  return (
    <div className="mk-capability-visual">
      <ol className="grid gap-1.5 text-small">
        {milestones.map((milestone, index) => (
          <li key={milestone} className="flex items-center gap-2.5 rounded-lg mk-bg-surface px-2.5 py-1.5 shadow-theme-xs">
            <span className="grid size-5 shrink-0 place-items-center rounded-md bg-brand-50 text-caption text-brand-500 dark:bg-brand-950 dark:text-brand-300">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate">{milestone}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ProactiveVisual() {
  const pr = useTranslations("marketing.aven.proactive");
  const notices = pr.raw("notices") as { title: string; body: string }[];
  const icons = [TimeIcon, BellIcon, CheckIcon];
  return (
    <div className="mk-capability-visual">
      {notices.map((notice, index) => {
        const Icon = icons[index];
        return (
          <div key={notice.title} className="mk-notice">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-500 dark:bg-brand-950 dark:text-brand-300"><Icon className="size-3.5" /></span>
            <span><b>{notice.title}</b><span className="mk-secondary">{notice.body}</span></span>
          </div>
        );
      })}
    </div>
  );
}

const CAPABILITIES = [
  { key: "conversation", Visual: ConversationVisual },
  { key: "planning", Visual: PlanningVisual },
  { key: "proactive", Visual: ProactiveVisual },
] as const;

export default function AvenShowcase() {
  const t = useTranslations("marketing.aven");
  return (
    <section id="aven" className="mk-section mk-band" aria-labelledby="mk-aven-title">
      <div className="mk-container">
        <SectionHeading
          id="mk-aven-title"
          center
          eyebrow={<><AvenMark small />{t("eyebrow")}</>}
          title={t("title")}
          description={t("description")}
        />
        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {CAPABILITIES.map(({ key, Visual }) => (
            <article key={key} className="mk-capability">
              <Visual />
              <div>
                <h3 className="text-h2">{t(`${key}.title`)}</h3>
                <p className="mk-copy mt-2">{t(`${key}.description`)}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-6 flex flex-wrap items-center justify-center gap-3 text-center text-small mk-muted">
          <span className="mk-example-tag">{t("exampleTag")}</span>
          {t("disclaimer")}
        </p>
        <div className="mt-20">
          <AvenDemo />
        </div>
      </div>
    </section>
  );
}
