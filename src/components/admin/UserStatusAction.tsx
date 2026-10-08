"use client";
import { useTranslations } from "next-intl";
import { useModal } from "@/hooks/useModal";
import { runOperation } from "@/lib/workspace/store";
import type { User, Workspace } from "@/types";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
interface Props {
  data: Workspace;
  user: User;
}
/** Confirm account state changes and record an audited status change. */
export default function UserStatusAction({ data, user }: Props) {
  const t = useTranslations("studyflow");
  const modal = useModal();
  const action = user.status === "active" ? "deactivate" : "reactivate";
  if (user.role === "admin") return null;
  return (
    <>
      <button
        onClick={modal.openModal}
        className="text-body text-brand-600 dark:text-brand-300"
      >
        {t(action)}
      </button>
      <ConfirmDialog
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        title={t(action)}
        description={t("userStatusWarning", { name: user.name })}
        onConfirm={async () => (await runOperation(data, { kind: "userStatus", id: user.id, status: action === "deactivate" ? "inactive" : "active" })).ok}
      />
    </>
  );
}
