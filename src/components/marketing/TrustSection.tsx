import { useTranslations } from "next-intl";
import { CheckIcon, FileIcon, LockIcon, SparklesIcon } from "@/icons";
import SectionHeading from "./SectionHeading";

/** Each point maps to behaviour that exists in the product today. */
const POINTS = [
  { key: "control", Icon: SparklesIcon },
  { key: "private", Icon: LockIcon },
  { key: "portable", Icon: FileIcon },
  { key: "pricing", Icon: CheckIcon },
] as const;

export default function TrustSection() {
  const t = useTranslations("marketing.trust");
  return (
    <section className="mk-section pt-0" aria-labelledby="mk-trust-title">
      <div className="mk-container">
        <SectionHeading id="mk-trust-title" eyebrow={t("eyebrow")} title={t("title")} />
        <ul className="mt-12 grid gap-x-10 gap-y-10 border-t mk-hairline pt-10 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map(({ key, Icon }) => (
            <li key={key}>
              <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-950 dark:text-brand-300">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-h3">{t(`${key}.title`)}</h3>
              <p className="mt-2 text-body mk-secondary">{t(`${key}.description`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
