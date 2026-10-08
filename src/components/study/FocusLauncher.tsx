"use client";
import { useTranslations } from "next-intl";
import { useModal } from "@/hooks/useModal";
import { useWorkspace } from "@/lib/workspace/store";
import { Link } from "@/i18n/navigation";
import { Modal } from "@/components/ui/modal";
import { StartPlayIcon, TimerIcon } from "@/icons";
import type { Workspace } from "@/types";
import TimerWidget from "./TimerWidget";
interface Props {
  initial: Workspace;
  className?: string;
  sidebar?: boolean;
  mobile?: boolean;
  active?: boolean;
  onOpen?: () => void;
}
export default function FocusLauncher({
  initial,
  className = "",
  sidebar = false,
  mobile = false,
  active = false,
  onOpen,
}: Props) {
  const t = useTranslations("studyflow");
  const modal = useModal();
  const data = useWorkspace(initial);
  const Icon = mobile ? TimerIcon : StartPlayIcon;
  const content = (
    <>
      <span className="sf-nav-icon">
        <Icon className="size-5 shrink-0" />
      </span>
      <span className={sidebar ? "sf-nav-label" : ""}>
        {t(mobile ? "study" : "startStudying")}
      </span>
    </>
  );
  if (data.shellPending) return (
    <button disabled className={className} aria-label={t("startStudying")} aria-current={active ? "page" : undefined}>
      {content}
    </button>
  );
  return (
    <>
      {data.timer ? (
        <Link
          href="/study"
          className={className}
          aria-label={t("startStudying")}
          aria-current={active ? "page" : undefined}
        >
          {content}
        </Link>
      ) : (
        <button
          onClick={() => {
            onOpen?.();
            modal.openModal();
          }}
          className={className}
          aria-label={t("startStudying")}
          aria-current={active ? "page" : undefined}
        >
          {content}
        </button>
      )}
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        title={t("redesign.startFocus")}
        className="sf-launcher"
      >
        {modal.isOpen && (
          <TimerWidget
            initial={initial}
            embedded
            onStarted={modal.closeModal}
          />
        )}
      </Modal>
    </>
  );
}
