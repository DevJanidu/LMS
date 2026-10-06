"use client";
import { useTranslations } from "next-intl";
import { useModal } from "@/hooks/useModal";
import { newId, updateWorkspace } from "@/lib/mock/store";
import type { User, Workspace } from "@/types";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
interface Props { data: Workspace; user: User }
/** Confirm account state changes and append a mock audit record. */
export default function UserStatusAction({ data, user }: Props) {
  const t = useTranslations("studyflow"); const modal = useModal(); const action = user.status === "active" ? "deactivate" : "reactivate";
  return <><button onClick={modal.openModal} className="text-sm text-brand-600 dark:text-brand-300">{t(action)}</button><ConfirmDialog isOpen={modal.isOpen} onClose={modal.closeModal} title={t(action)} description={t("userStatusWarning", { name: user.name })} onConfirm={() => updateWorkspace(data, (state) => ({ ...state, user: state.user.id === user.id ? { ...state.user, status: action === "deactivate" ? "inactive" : "active" } : state.user, users: state.users.map((item) => item.id === user.id ? { ...item, status: action === "deactivate" ? "inactive" : "active" } : item), auditLogs: [{ id: newId(), actorUserId: "admin-1", action, targetType: "user", targetId: user.id, createdAt: new Date().toISOString() }, ...state.auditLogs] }))}/></>;
}
