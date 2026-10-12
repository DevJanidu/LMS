import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRightIcon } from "@/icons";
import SectionHeading from "./SectionHeading";
import FeatureRow from "./FeatureRow";
import DashboardPreview from "./previews/DashboardPreview";
import PlannerPreview from "./previews/PlannerPreview";
import GoalsPreview from "./previews/GoalsPreview";
import AnalyticsPreview from "./previews/AnalyticsPreview";
import LibraryPreview from "./previews/LibraryPreview";

function WorkspacePreview() {
  return <div className="mk-panel p-4"><DashboardPreview compact /></div>;
}

const FEATURES = [
  { key: "workspace", Visual: WorkspacePreview },
  { key: "planner", Visual: PlannerPreview },
  { key: "goals", Visual: GoalsPreview },
  { key: "analytics", Visual: AnalyticsPreview },
  { key: "library", Visual: LibraryPreview },
] as const;

export default function ProductShowcase() {
  const t = useTranslations("marketing.features");
  return (
    <section id="features" className="mk-section" aria-labelledby="mk-features-title">
      <div className="mk-container">
        <SectionHeading id="mk-features-title" eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
        <div className="mt-16 lg:mt-24">
          {FEATURES.map(({ key, Visual }, index) => (
            <FeatureRow
              key={key}
              index={index + 1}
              flip={index % 2 === 1}
              eyebrow={t(`${key}.eyebrow`)}
              title={t(`${key}.title`)}
              description={t(`${key}.description`)}
              points={t.raw(`${key}.points`) as string[]}
              action={
                key === "goals" ? (
                  <Link href="/#aven" className="mk-link">{t("goals.action")}<ArrowRightIcon /></Link>
                ) : undefined
              }
            >
              <div role="img" aria-label={t(`${key}.visualLabel`)}>
                <div aria-hidden="true" inert>
                  <Visual />
                </div>
              </div>
            </FeatureRow>
          ))}
        </div>
      </div>
    </section>
  );
}
