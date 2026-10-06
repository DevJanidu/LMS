"use client";
import { useTranslations } from "next-intl";
import { getSubjects, getTopics } from "@/lib/mock";
import type { Workspace } from "@/types";
import { SelectField } from "@/components/studyflow/FormFields";
interface Props {
  data: Workspace;
  subjectId: string;
  topicId: string;
  onSubjectChange: (id: string) => void;
  onTopicChange: (id: string) => void;
  includeArchived?: boolean;
  subjectRequired?: boolean;
}
/** Shared selectors always scope the optional topic to its subject. */
export default function StudySelectors({
  data,
  subjectId,
  topicId,
  onSubjectChange,
  onTopicChange,
  includeArchived = false,
  subjectRequired = true,
}: Props) {
  const t = useTranslations("studyflow");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField
        label={t("subject")}
        value={subjectId}
        required={subjectRequired}
        onChange={(event) => {
          onSubjectChange(event.target.value);
          onTopicChange("");
        }}
      >
        <option value="">{t("chooseSubject")}</option>
        {getSubjects(data)
          .filter((subject) => includeArchived || subject.status === "active")
          .map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.title}
            </option>
          ))}
      </SelectField>
      <SelectField
        label={t("topicOptional")}
        value={topicId}
        onChange={(event) => onTopicChange(event.target.value)}
        disabled={!subjectId}
      >
        <option value="">{t("anyTopic")}</option>
        {getTopics(data, subjectId).map((topic) => (
          <option key={topic.id} value={topic.id}>
            {topic.title}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
