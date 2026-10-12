"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import type { GoalReferences, listGoals } from "@/lib/goals/service";
import type { GoalDetail, GoalRecord } from "@/lib/goals/model";
import { featureRequest, saveGoal } from "@/lib/goals/client";
import { goalStatuses, type GoalInput } from "@/lib/goals/validation";
import PageHeader from "@/components/studyflow/PageHeader";
import Field, { SelectField } from "@/components/studyflow/FormFields";
import Pagination from "@/components/studyflow/Pagination";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/studyflow/EmptyState";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import GoalCard from "./GoalCard";
import GoalEditor from "./GoalEditor";
import GoalMetrics from "./GoalMetrics";
type GoalList = Awaited<ReturnType<typeof listGoals>>;
interface Props {
  /** Server-ranked next best action, rendered below the header. */
  nextAction?: React.ReactNode;
  initial: GoalList;
  references: GoalReferences;
}
export default function GoalsDashboard({
  initial,
  references,
  nextAction,
}: Props) {
  const t = useTranslations("goals"),
    router = useRouter();
  const [list, setList] = useState(initial),
    [query, setQuery] = useState(initial.search),
    [status, setStatus] = useState(initial.status),
    [sort, setSort] = useState(initial.sort),
    [page, setPage] = useState(initial.page),
    [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<GoalRecord | null | undefined>(),
    [deleting, setDeleting] = useState<GoalDetail>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const initialKey = useRef(
    `${initial.page}|${initial.search}|${initial.status}|${initial.sort}|0`,
  );
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      setQuery((params.get("search") ?? "").slice(0, 100));
      const status = params.get("status") ?? "";
      setStatus(goalStatuses.some((value) => value === status) ? status : "");
      const sort = params.get("sort");
      setSort(sort === "progress" || sort === "updated" ? sort : "deadline");
      const page = Number(params.get("page") ?? 1);
      setPage(Number.isInteger(page) && page > 0 ? page : 1);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const newGoalId = useRef<string | null>(null);
  const create = () => {
    newGoalId.current = crypto.randomUUID();
    setEditing(null);
  };
  useEffect(() => {
    const key = `${page}|${query}|${status}|${sort}|${revision}`;
    if (initialKey.current === key) {
      const settled = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(settled);
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => {
        setLoading(true);
        const url = new URL(window.location.href);
        for (const [key, value] of Object.entries({
          page: page > 1 ? String(page) : "",
          search: query,
          status,
          sort: sort === "deadline" ? "" : sort,
        })) {
          if (value) url.searchParams.set(key, value);
          else url.searchParams.delete(key);
        }
        window.history.replaceState(null, "", url);
        void featureRequest<GoalList>(
          `/api/goals?page=${page}&search=${encodeURIComponent(query)}&status=${status}&sort=${sort}`,
          undefined,
          controller.signal,
        )
          .then((value) => {
            if (controller.signal.aborted) return;
            initialKey.current = key;
            setList(value);
            setPage(value.page);
            setError("");
          })
          .catch((error) => {
            if (!controller.signal.aborted)
              setError(
                t.has(`errors.${error.message}`)
                  ? t(`errors.${error.message}`)
                  : t("errors.serviceUnavailable"),
              );
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      query ? 200 : 0,
    );
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [page, query, status, sort, revision, t]);
  const save = async (value: GoalInput) => {
    const id = editing?.id ?? newGoalId.current ?? crypto.randomUUID();
    newGoalId.current = id;
    let result: { detail?: GoalDetail };
    try {
      result = await saveGoal({
        operationId: crypto.randomUUID(),
        goalId: id,
        expectedVersion: editing?.version ?? 0,
        action: { kind: "goal", value },
      });
    } catch (error) {
      if (!editing) {
        try {
          result = await featureRequest<{ detail: GoalDetail }>(
            `/api/goals?id=${id}`,
          );
        } catch {
          throw error;
        }
      } else {
        setRevision((value) => value + 1);
        throw error;
      }
    }
    void result;
    setEditing(undefined);
    setRevision((value) => value + 1);
    router.refresh();
  };
  const [completing, setCompleting] = useState<string>();
  const complete = async (detail: GoalDetail) => {
    if (completing) return;
    setCompleting(detail.goal.id);
    try {
      await saveGoal({
        operationId: crypto.randomUUID(),
        goalId: detail.goal.id,
        expectedVersion: detail.goal.version,
        action: {
          kind: "completion",
          completed: detail.goal.status !== "completed",
        },
      });
      setRevision((value) => value + 1);
      router.refresh();
    } catch (error) {
      const key = (error as Error).message;
      setError(
        t.has("errors." + key)
          ? t("errors." + key)
          : t("errors.serviceUnavailable"),
      );
    } finally {
      setCompleting(undefined);
    }
  };
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("workspace.description")}
        action={
          <div className="goal-actions">
            <Link href="/aven?intent=plan" className="sf-action-secondary">
              {t("workspace.planWithAven")}
            </Link>
            <Button onClick={create}>{t("createGoal")}</Button>
          </div>
        }
      />
      <GoalMetrics statistics={list.statistics} />
      {nextAction && (
        <div className="goal-list-recommendation">{nextAction}</div>
      )}
      <div className="goal-filter-bar">
        <Field
          label={t("search")}
          value={query}
          maxLength={100}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
        <SelectField
          label={t("fields.status")}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("allStatuses")}</option>
          {goalStatuses.map((key) => (
            <option key={key} value={key}>
              {t(`statuses.${key}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("workspace.sort")}
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as typeof sort);
            setPage(1);
          }}
        >
          {(["deadline", "progress", "updated"] as const).map((key) => (
            <option key={key} value={key}>
              {t(`workspace.sorts.${key}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <p className="goal-results" role="status">
        {loading
          ? t("workspace.loading")
          : t("workspace.resultCount", { count: list.total })}
      </p>
      {error && (
        <p
          role="alert"
          className="mb-4 text-small text-error-600 dark:text-error-400"
        >
          {error}
        </p>
      )}
      <div aria-busy={loading} className="goal-grid">
        {list.details.map((detail) => (
          <GoalCard
            key={detail.goal.id}
            detail={detail}
            onComplete={() => {
              void complete(detail);
            }}
            busy={Boolean(completing)}
            onEdit={() => setEditing(detail.goal)}
            onDelete={() => setDeleting(detail)}
          />
        ))}
      </div>
      {!list.details.length && (
        <EmptyState
          title={t(
            query || status ? "workspace.noResults" : "workspace.emptyTitle",
          )}
          description={t(
            query || status ? "workspace.noResultsHelp" : "workspace.emptyHelp",
          )}
          action={
            <div className="goal-actions">
              {query || status ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setStatus("");
                    setPage(1);
                  }}
                >
                  {t("workspace.clearFilters")}
                </Button>
              ) : (
                <>
                  <Button onClick={create}>{t("createGoal")}</Button>
                  <Link
                    href="/aven?intent=plan"
                    className="sf-action-secondary"
                  >
                    {t("workspace.planWithAven")}
                  </Link>
                </>
              )}
            </div>
          }
        />
      )}
      <Pagination
        page={list.page}
        pages={Math.max(1, Math.ceil(list.total / 20))}
        onChange={setPage}
      />
      {editing !== undefined && (
        <GoalEditor
          goal={editing ?? undefined}
          references={references}
          onClose={() => setEditing(undefined)}
          onSave={save}
        />
      )}
      <ConfirmDialog
        background={false}
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        title={t("deleteGoal")}
        description={t("deleteWarning")}
        onConfirm={async () => {
          if (!deleting) return false;
          try {
            await saveGoal({
              operationId: crypto.randomUUID(),
              goalId: deleting.goal.id,
              expectedVersion: deleting.goal.version,
              action: { kind: "deleteGoal" },
            });
            setDeleting(undefined);
            setRevision((value) => value + 1);
            return true;
          } catch {
            setError(t("errors.conflict"));
            setRevision((value) => value + 1);
            return false;
          }
        }}
      />
    </>
  );
}
