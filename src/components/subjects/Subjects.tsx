"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useModal } from "@/hooks/useModal";
import { getSessions, getSubjects, getTopics } from "@/lib/mock";
import { useWorkspace } from "@/lib/mock/store";
import type { Workspace } from "@/types";
import Button from "@/components/ui/button/Button";
import PageHeader from "@/components/studyflow/PageHeader";
import EmptyState from "@/components/studyflow/EmptyState";
import Field, { SelectField } from "@/components/studyflow/FormFields";
import SubjectCard from "./SubjectCard";
import SubjectModal from "./SubjectModal";
interface Props { initial: Workspace; add?: boolean }
/** Searchable active/archive subject library. */
export default function Subjects({ initial, add = false }: Props) {
  const data = useWorkspace(initial); const t = useTranslations("studyflow"); const modal = useModal(add);
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("active");
  const subjects = getSubjects(data).filter((subject) => subject.status === status && subject.title.toLowerCase().includes(search.toLowerCase()));
  return <><PageHeader title={t("subjects")} description={t("subjectsDescription")} action={<Button onClick={modal.openModal}>{t("addSubject")}</Button>}/><div className="mb-6 grid gap-4 sm:grid-cols-2"><Field label={t("searchSubjects")} value={search} onChange={(event) => setSearch(event.target.value)}/><SelectField label={t("status")} value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">{t("active")}</option><option value="archived">{t("archived")}</option></SelectField></div>{subjects.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{subjects.map((subject) => <SubjectCard key={subject.id} subject={subject} topics={getTopics(data, subject.id)} sessions={getSessions(data).filter((session) => session.subjectId === subject.id)} timezone={data.user.timezone}/>)}</div> : <EmptyState title={search || status === "archived" ? t("noResults") : t("noSubjects")} description={t("noSubjectsHelp")} action={<Button onClick={modal.openModal}>{t("addSubject")}</Button>}/>}<SubjectModal initial={initial} isOpen={modal.isOpen} onClose={modal.closeModal}/></>;
}
