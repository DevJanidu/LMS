"use client";
import { GridIcon, ListIcon } from "@/icons";
import { useEffect, useRef, useState } from "react";
import { queryResources, resourceDetail } from "@/lib/workspace/transport";
import type { ResourcePage } from "@/lib/services/resources";
import LibraryPagination from "./LibraryPagination";
import ResourceCard from "./ResourceCard";
import { RESOURCE_PAGE_SIZE, type LibraryView } from "./resourcePresentation";
import { useTranslations } from "next-intl";
import { useModal } from "@/hooks/useModal";
import { getResources, getSubjects, getTopics } from "@/lib/workspace/queries";
import { runOperation, useWorkspace, collectionRevision, useProjectedCollection } from "@/lib/workspace/store";
import useQueryRefresh from "@/hooks/useQueryRefresh";
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
  const [view, setView] = useState<LibraryView>("grid");
  const [editing, setEditing] = useState<Resource>();
  const [deleting, setDeleting] = useState<Resource>();
  const [opened, setOpened] = useState<Resource>();
  const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set());
  const detailSequence = useRef(0);
  const detailRequests = useRef(new Set<string>());
  const libraryRef = useRef<HTMLDivElement>(null);
  const scrollResults = useRef(false);
  useEffect(() => () => { detailSequence.current++; }, []);
  const [error, setError] = useState("");
  const openResource = async (resource: Resource, edit: boolean) => {
    if (detailRequests.current.has(resource.id)) return;
    detailRequests.current.add(resource.id);
    const sequence = ++detailSequence.current;
    setLoadingIds(ids => new Set(ids).add(resource.id)); setError("");
    try {
      const detail = resource.type === "note" ? await resourceDetail(resource.id, data.user.id) : { ok: true as const, textContent: undefined };
      if (sequence !== detailSequence.current) return;
      if (!detail.ok) { setError(t(detail.error)); return; }
      const value = { ...resource, textContent: detail.textContent };
      if (edit) { setEditing(value); modal.openModal(); }
      else { setOpened(value); preview.openModal(); }
    } catch { if (sequence === detailSequence.current) setError(t("saveFailed")); }
    finally {
      detailRequests.current.delete(resource.id);
      setLoadingIds(ids => { const next = new Set(ids); next.delete(resource.id); return next; });
    }
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
        detailSequence.current++;
        setEditing(undefined);
        modal.openModal();
      }}
    >
      {t("addResource")}
    </Button>
  );
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<ResourcePage>(initialPage ?? { total: fallback.length, rows: fallback.slice(0, RESOURCE_PAGE_SIZE) });
  const [loading, setLoading] = useState(false);
  const [observed, setObserved] = useState(0);
  const sync = useQueryRefresh();
  const lastQuery = useRef(initialPage ? JSON.stringify({ page: 1, query: search, subject: subjectId, topic: "", type: "", sort: "newest", revision: initial.user.updatedAt, rows: initial.resources, sync: 0 }) : "");
  useEffect(() => {
    const key = JSON.stringify({ page, query, subject, topic, type, sort, revision: data.user.updatedAt, rows: data.resources, sync });
    if (lastQuery.current === key) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      const revision = collectionRevision();
      setLoading(true);
      void queryResources({ page, search: query, subjectId: subject || undefined, topicId: topic || undefined, type: type || undefined, sort }, data.user.id).then(result => {
        if (cancelled) return;
        if (result.ok) {
          const lastPage = Math.max(1, Math.ceil(result.data.total / RESOURCE_PAGE_SIZE));
          if (page > lastPage) { setPage(lastPage); return; }
          lastQuery.current = key; setRecords(result.data); setObserved(revision); setError("");
          if (scrollResults.current) {
            scrollResults.current = false;
            requestAnimationFrame(() => libraryRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }));
          }
        } else setError(t(result.error));
      }).catch(() => { if (!cancelled) setError(t("saveFailed")); }).finally(() => { if (!cancelled) setLoading(false); });
    }, query ? 250 : 0);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [page, query, subject, topic, type, sort, data.resources, data.user.updatedAt, data.user.id, sync, t]);
  const resources = useProjectedCollection("resources", records.rows, observed).filter(row => (!subject || row.subjectId === subject) && (!topic || row.topicId === topic) && (!type || row.type === type) && (!query || row.title.toLowerCase().includes(query.toLowerCase())));
  const pages = Math.max(1, Math.ceil(records.total / RESOURCE_PAGE_SIZE));
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
      <div className="sf-filter-bar mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
      <div className="sf-library-toolbar mb-8 flex flex-wrap items-center justify-between gap-4">
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <p role="status" className="text-small text-muted dark:text-muted">{loading ? t("loading") : t("library.count", { count: records.total })}</p>
        <div role="group" aria-label={t("library.view")} className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
          {(["grid", "list"] as const).map(layout => {
            const Icon = layout === "grid" ? GridIcon : ListIcon;
            return <button key={layout} type="button" title={t(`library.${layout}`)} aria-label={t(`library.${layout}`)} aria-pressed={view === layout} onClick={() => setView(layout)} className="grid size-11 place-items-center rounded-lg text-secondary transition hover:bg-gray-100 aria-pressed:bg-brand-50 aria-pressed:text-brand-600 dark:text-secondary dark:hover:bg-gray-800 dark:aria-pressed:bg-brand-950/50 dark:aria-pressed:text-brand-300"><Icon aria-hidden="true" className="size-5" /></button>;
          })}
        </div>
      </div>
      {resources.length ? (
        <div ref={libraryRef} aria-busy={loading} data-library-view={view} className={view === "grid" ? "grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "space-y-3"}>
          {resources.map(resource => <ResourceCard
            key={resource.id}
            resource={resource}
            subject={data.subjects.find(item => item.id === resource.subjectId)?.title}
            topic={data.topics.find(item => item.id === resource.topicId)?.title}
            view={view}
            busy={loadingIds.has(resource.id)}
            onOpen={() => { void openResource(resource, false); }}
            onEdit={() => { void openResource(resource, true); }}
            onDelete={() => setDeleting(resource)}
          />)}
        </div>
      ) : loading ? <p role="status" className="py-12 text-center text-body text-secondary dark:text-secondary">{t("loading")}</p> : (
        <EmptyState title={t("noResources")} description={t("noResourcesHelp")} action={addButton} />
      )}
      <LibraryPagination page={current} total={records.total} loading={loading} onChange={next => {
        if (next === page) return;
        scrollResults.current = true;
        setPage(next);
      }} />
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
        onConfirm={() => deleting ? runOperation(initial, { kind: "delete", entity: "resource", id: deleting.id }, deleting).then(result => result.ok) : false}
      />
    </>
  );
}
