"use client";
import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useModal } from "@/hooks/useModal";
import { getResources, getSubjects, getTopics } from "@/lib/mock";
import { updateWorkspace, useWorkspace } from "@/lib/mock/store";
import type { Resource, Workspace } from "@/types";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import PageHeader from "@/components/studyflow/PageHeader";
import EmptyState from "@/components/studyflow/EmptyState";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import Field, { SelectField } from "@/components/studyflow/FormFields";
import ResourceModal from "./ResourceModal";
import NotePreview from "./NotePreview";
interface Props {
  initial: Workspace;
  subjectId?: string;
  embedded?: boolean;
  add?: boolean;
  search?: string;
}
function youtubeId(url: string): string | undefined {
  try {
    const value = new URL(url);
    const id =
      value.hostname === "youtu.be"
        ? value.pathname.slice(1)
        : ["youtube.com", "www.youtube.com"].includes(value.hostname)
          ? value.searchParams.get("v")
          : null;
    return id && /^[\w-]{11}$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
/** Unified resource library and subject-scoped resource tab. */
export default function Resources({
  initial,
  subjectId = "",
  embedded = false,
  add = false,
  search = "",
}: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const modal = useModal(add);
  const preview = useModal();
  const [query, setQuery] = useState(search);
  const [subject, setSubject] = useState(subjectId);
  const [topic, setTopic] = useState("");
  const [type, setType] = useState("");
  const [editing, setEditing] = useState<Resource>();
  const [deleting, setDeleting] = useState<Resource>();
  const [opened, setOpened] = useState<Resource>();
  const resources = getResources(data).filter(
    (item) =>
      (!subject || item.subjectId === subject) &&
      (!topic || item.topicId === topic) &&
      (!type || item.type === type) &&
      item.title.toLowerCase().includes(query.toLowerCase()),
  );
  const addButton = (
    <Button
      onClick={() => {
        setEditing(undefined);
        modal.openModal();
      }}
    >
      {t("addResource")}
    </Button>
  );
  return (
    <>
      {embedded ? (
        <div className="mb-5 flex justify-end">{addButton}</div>
      ) : (
        <PageHeader
          title={t("resources")}
          description={t("resourcesDescription")}
          action={addButton}
        />
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field
          label={t("searchResources")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {!embedded && (
          <SelectField
            label={t("subject")}
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              setTopic("");
            }}
          >
            <option value="">{t("allSubjects")}</option>
            {getSubjects(data).map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </SelectField>
        )}
        <SelectField
          label={t("topic")}
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
        >
          <option value="">{t("allTopics")}</option>
          {getTopics(data, subject || undefined).map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("type")}
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">{t("allTypes")}</option>
          {["file", "link", "video", "note"].map((key) => (
            <option key={key} value={key}>
              {t(key)}
            </option>
          ))}
        </SelectField>
      </div>
      {resources.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resources.map((resource) => {
            const id =
              resource.type === "video" && resource.url
                ? youtubeId(resource.url)
                : undefined;
            return (
              <article
                key={resource.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3"
              >
                {id && (
                  <Image
                    src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
                    alt={resource.title}
                    width={480}
                    height={270}
                    unoptimized
                    className="aspect-video w-full object-cover"
                  />
                )}
                <div className="p-5">
                  <span className="text-theme-xs font-medium text-brand-600 uppercase dark:text-brand-300">
                    {t(resource.type)}
                  </span>
                  <h2 className="mt-2 font-medium">{resource.title}</h2>
                  <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
                    {
                      data.subjects.find(
                        (item) => item.id === resource.subjectId,
                      )?.title
                    }
                    {resource.sizeBytes
                      ? ` · ${(resource.sizeBytes / 1024 / 1024).toFixed(1)} MB`
                      : ""}
                  </p>
                  <div className="mt-5 flex gap-4 text-sm">
                    {resource.url && /^https?:\/\//i.test(resource.url) ? (
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 dark:text-brand-300"
                      >
                        {t("open")}
                      </a>
                    ) : (
                      <button
                        onClick={() => {
                          setOpened(resource);
                          preview.openModal();
                        }}
                        className="text-brand-600 dark:text-brand-300"
                      >
                        {t("open")}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditing(resource);
                        modal.openModal();
                      }}
                      className="text-gray-500 dark:text-gray-400"
                    >
                      {t("edit")}
                    </button>
                    <button
                      onClick={() => setDeleting(resource)}
                      className="text-error-600 dark:text-error-400"
                    >
                      {t("delete")}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={t("noResources")}
          description={t("noResourcesHelp")}
          action={addButton}
        />
      )}{" "}
      {modal.isOpen && (
        <ResourceModal
          key={editing?.id ?? "new"}
          data={data}
          resource={editing}
          subjectId={subject}
          isOpen
          onClose={modal.closeModal}
        />
      )}
      <Modal
        isOpen={preview.isOpen}
        onClose={preview.closeModal}
        title={opened?.title}
      >
        {opened?.type === "file" ? (
          <p className="text-sm">{t("fileMockNotice")}</p>
        ) : (
          <NotePreview text={opened?.textContent ?? ""} />
        )}
      </Modal>
      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        title={t("deleteResource")}
        description={t("deleteResourceWarning")}
        onConfirm={() =>
          updateWorkspace(initial, (state) => ({
            ...state,
            resources: state.resources.filter(
              (item) => item.id !== deleting?.id,
            ),
          }))
        }
      />
    </>
  );
}
