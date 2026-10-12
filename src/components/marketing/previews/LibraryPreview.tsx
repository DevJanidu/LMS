import { useTranslations } from "next-intl";
import { CheckIcon, FileIcon, FolderIcon, LinkIcon, PlayIcon } from "@/icons";

interface Topic {
  title: string;
  status: "completed" | "in_progress" | "not_started";
}
interface Resource {
  title: string;
  meta: string;
  type: "pdf" | "link" | "video";
}

const RESOURCE_ICON = { pdf: FileIcon, link: LinkIcon, video: PlayIcon };

/** A subject with its topics and attached learning resources. */
export default function LibraryPreview() {
  const t = useTranslations("marketing.preview.library");
  const topics = t.raw("topics") as Topic[];
  const resources = t.raw("resources") as Resource[];
  return (
    <div className="mk-panel grid gap-3 p-4 sm:grid-cols-2">
      <div className="mk-card mk-card-pad">
        <div className="flex items-center gap-2">
          <FolderIcon className="size-4 text-brand-500 dark:text-brand-300" />
          <p className="text-body-strong">{t("subject")}</p>
        </div>
        <p className="mt-1 mk-muted">{t("subjectMeta")}</p>
        <ul className="mt-3 grid gap-2">
          {topics.map((topic) => (
            <li key={topic.title} className="flex items-center gap-2">
              <span className="mk-check" data-done={topic.status === "completed"}>{topic.status === "completed" && <CheckIcon />}</span>
              <span className="min-w-0 flex-1 truncate">{topic.title}</span>
              {topic.status === "in_progress" && <span className="mk-chip mk-chip-brand">{t("inProgress")}</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="mk-card mk-card-pad">
        <p className="text-body-strong">{t("resourcesTitle")}</p>
        <ul className="mt-3 grid gap-2">
          {resources.map((resource) => {
            const Icon = RESOURCE_ICON[resource.type];
            return (
              <li key={resource.title} className="flex items-center gap-3 rounded-lg mk-bg-subtle px-2.5 py-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-md mk-bg-surface text-brand-500 shadow-theme-xs dark:text-brand-300">
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{resource.title}</span>
                  <span className="block mk-muted">{resource.meta}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
