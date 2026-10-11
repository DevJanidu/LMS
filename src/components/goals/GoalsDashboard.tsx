"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { GoalReferences, listGoals } from "@/lib/goals/service";
import type { GoalDetail, GoalRecord } from "@/lib/goals/model";
import { featureRequest, saveGoal } from "@/lib/goals/client";
import { type GoalInput } from "@/lib/goals/validation";
import PageHeader from "@/components/studyflow/PageHeader";
import Field, { SelectField } from "@/components/studyflow/FormFields";
import Pagination from "@/components/studyflow/Pagination";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/studyflow/EmptyState";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import GoalCard from "./GoalCard";
import GoalEditor from "./GoalEditor";
type GoalList = Awaited<ReturnType<typeof listGoals>>;
interface Props {
  initial: GoalList;
  references: GoalReferences;
}
export default function GoalsDashboard({ initial, references }: Props) {
  const t = useTranslations("goals"),
    router = useRouter();
  const [list, setList] = useState(initial),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(initial.page),
    [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<GoalRecord | null | undefined>(),
    [deleting, setDeleting] = useState<GoalDetail>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const initialKey = useRef("1|||0");
  const newGoalId = useRef<string | null>(null);
  const create = () => {
    newGoalId.current = crypto.randomUUID();
    setEditing(null);
  };
  useEffect(() => {
    const key = `${page}|${query}|${status}|${revision}`;
    if (initialKey.current === key) return;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => {
        setLoading(true);
        void featureRequest<GoalList>(
          `/api/goals?page=${page}&search=${encodeURIComponent(query)}&status=${status}`,
          undefined,
          controller.signal,
        )
          .then((value) => {
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
  }, [page, query, status, revision, t]);
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
  const labels = ["active", "completed"] as const;
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("simpleGoalHelp")}
        action={<Button onClick={create}>{t("createGoal")}</Button>}
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {labels.map((key) => (
          <div
            key={key}
            className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-dark"
          >
            <p className="text-secondary dark:text-secondary text-small">
              {t(`summary.${key}`)}
            </p>
            <p className="text-primary dark:text-primary mt-2 text-stat">
              {Number(list.statistics[key])}
            </p>
          </div>
        ))}
      </div>
      <div className="sf-filter-bar mb-6 grid gap-4 sm:grid-cols-2">
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
          {(["active", "completed"] as const).map((key) => (
            <option key={key} value={key}>
              {t(`statuses.${key}`)}
            </option>
          ))}
        </SelectField>
      </div>
      {error && (
        <p
          role="alert"
          className="mb-4 text-small text-error-600 dark:text-error-400"
        >
          {error}
        </p>
      )}
      <div
        aria-busy={loading}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
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
          title={t("empty")}
          description={t("emptyHelp")}
          action={<Button onClick={create}>{t("createGoal")}</Button>}
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
