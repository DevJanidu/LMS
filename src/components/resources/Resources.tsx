"use client";
import Image from "next/image";
import { FileIcon, LinkIcon, PlayIcon } from "@/icons";
import { useEffect, useRef, useState } from "react";
import { queryResources, resourceDetail } from "@/app/[locale]/actions";
import type { ResourcePage } from "@/lib/services/resources";
import Pagination from "@/components/studyflow/Pagination";
import { useTranslations } from "next-intl";
import { useModal } from "@/hooks/useModal";
import { getResources, getSubjects, getTopics } from "@/lib/workspace/queries";
import { updateWorkspace, useWorkspace } from "@/lib/workspace/store";
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
  initialPage?: ResourcePage;
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
  initialPage,
}: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const modal = useModal(add);
  const preview = useModal();
  const [query, setQuery] = useState(search);
  const [subject, setSubject] = useState(subjectId);
  const [topic, setTopic] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("newest");
  const [editing, setEditing] = useState<Resource>();
  const [deleting, setDeleting] = useState<Resource>();
  const [opened, setOpened] = useState<Resource>();
  const [loadingId, setLoadingId] = useState("");
  const [error, setError] = useState("");
  const openResource = async (resource: Resource, edit: boolean) => {
    if (loadingId) return;
    setLoadingId(resource.id); setError("");
    try {
      const detail = resource.type === "note" ? await resourceDetail(resource.id) : { ok: true as const, textContent: undefined };
      if (!detail.ok) { setError(t(detail.error)); return; }
      const value = { ...resource, textContent: detail.textContent };
      if (edit) { setEditing(value); modal.openModal(); }
      else { setOpened(value); preview.openModal(); }
    } catch { setError(t("saveFailed")); }
    finally { setLoadingId(""); }
  };
  const fallback = getResources(data)
    .filter(
      (item) =>
        (!subject || item.subjectId === subject) &&
        (!topic || item.topicId === topic) &&
        (!type || item.type === type) &&
        item.title.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title)
        : sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
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
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<ResourcePage>(initialPage ?? { total: fallback.length, rows: fallback.slice(0, 20) });
  const [loading, setLoading] = useState(false);
  const lastQuery = useRef(initialPage ? JSON.stringify({ page: 1, query: search, subject: subjectId, topic: "", type: "", sort: "newest", revision: initial.user.updatedAt }) : "");
  useEffect(() => {
    const key = JSON.stringify({ page, query, subject, topic, type, sort, revision: data.user.updatedAt });
    if (lastQuery.current === key) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      setLoading(true);
      void queryResources({ page, search: query, subjectId: subject || undefined, topicId: topic || undefined, type: type || undefined, sort }).then(result => {
        if (cancelled) return;
        if (result.ok) { lastQuery.current = key; setRecords(result.data); setError(""); } else setError(t(result.error));
      }).catch(() => { if (!cancelled) setError(t("saveFailed")); }).finally(() => { if (!cancelled) setLoading(false); });
    }, query ? 250 : 0);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [page, query, subject, topic, type, sort, data.resources, data.user.updatedAt, t]);
  const resources = records.rows;
  const pages = Math.max(1, Math.ceil(records.total / 20));
  const current = Math.min(page, pages);
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
      <div className="sf-filter-bar mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field
          label={t("searchResources")}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(1); }}
        />
        {!embedded && (
          <SelectField
            label={t("subject")}
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              setTopic("");
              setPage(1);
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
          onChange={(event) => { setTopic(event.target.value); setPage(1); }}
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
          onChange={(event) => { setType(event.target.value); setPage(1); }}
        >
          <option value="">{t("allTypes")}</option>
          {["file", "link", "video", "note"].map((key) => (
            <option key={key} value={key}>
              {t(key)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="sf-library-toolbar mb-6 flex flex-wrap items-center justify-between gap-4">
        <div
          role="group"
          aria-label={t("redesign.resourceTypes")}
          className="sf-segments"
        >
          {["", "file", "video", "link", "note"].map((key) => (
            <button
              key={key}
              aria-pressed={type === key}
              onClick={() => { setType(key); setPage(1); }}
            >
              {t(key || "allTypes")}
            </button>
          ))}
        </div>
        <SelectField
          label={t("redesign.librarySort")}
          value={sort}
          onChange={(event) => { setSort(event.target.value); setPage(1); }}
        >
          <option value="newest">{t("redesign.newest")}</option>
          <option value="oldest">{t("redesign.oldest")}</option>
          <option value="name">{t("name")}</option>
        </SelectField>
      </div>
      {error && <p role="alert" className="mb-4 text-body text-error-600 dark:text-error-400">{error}</p>}
      {resources.length ? (
        <div aria-busy={loading} className="sf-library space-y-3">
          {resources.map((resource) => {
            const id =
              resource.type === "video" && resource.url
                ? youtubeId(resource.url)
                : undefined;
            return (
              <article
                key={resource.id}
                className="sf-resource-row overflow-hidden"
              >
                <div className="sf-resource-preview">
                  {id ? (
                    <Image
                      src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
                      alt={resource.title}
                      width={480}
                      height={270}
                      unoptimized
                      className="sf-resource-image object-cover"
                    />
                  ) : resource.type === "link" ? (
                    <LinkIcon className="size-5" />
                  ) : resource.type === "video" ? (
                    <PlayIcon className="size-5" />
                  ) : (
                    <FileIcon className="size-5" />
                  )}
                </div>
                <div className="sf-resource-body p-5">
                  <span className="text-overline text-muted">
                    {t(resource.type)}
                  </span>
                  <h2 className="mt-2 text-h3">{resource.title}</h2>
                  <p className="mt-2 text-small text-muted dark:text-secondary">
                    {
                      data.subjects.find(
                        (item) => item.id === resource.subjectId,
                      )?.title
                    }
                    {resource.sizeBytes
                      ? ` · ${(resource.sizeBytes / 1024 / 1024).toFixed(1)} MB`
                      : ""}
                  </p>
                  <div className="sf-resource-actions flex gap-4 text-body">
                    {resource.type === "file" ? (<a href={`/api/files/${resource.id}`} target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-300">{t("open")}</a>) : resource.url && /^https?:\/\//i.test(resource.url) ? (
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
                        disabled={Boolean(loadingId)}
                        onClick={() => { void openResource(resource, false); }}
                        className="text-brand-600 dark:text-brand-300"
                      >
                        {t(loadingId === resource.id ? "loading" : "open")}
                      </button>
                    )}
                    <button
                      disabled={Boolean(loadingId)}
                      onClick={() => { void openResource(resource, true); }}
                      className="text-muted dark:text-secondary"
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
      <Pagination page={current} pages={pages} onChange={setPage} />
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
          <a href={`/api/files/${opened.id}`} target="_blank" rel="noopener noreferrer">{t("open")}</a>
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
