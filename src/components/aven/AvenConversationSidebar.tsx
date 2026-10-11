"use client";
import { useTranslations } from "next-intl";
import { CloseIcon, TrashIcon } from "@/icons";
interface Props {
  conversations: { id: string; title: string }[];
  selected: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}
export default function AvenConversationSidebar({
  conversations,
  selected,
  busy,
  onSelect,
  onDelete,
  onClose,
}: Props) {
  const t = useTranslations("aven");
  return (
    <aside
      id="aven-conversations"
      aria-label={t("conversations")}
      className="aven-conversation-sidebar flex flex-col border-e border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-dark"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-primary dark:text-primary text-h3">
          {t("conversations")}
        </h2>
        <button
          type="button"
          aria-label={t("hideConversations")}
          onClick={onClose}
          className="text-secondary dark:text-secondary grid size-11 place-items-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto">
        {conversations.map((conversation) => (
          <div key={conversation.id} className="flex items-center gap-1">
            <button
              type="button"
              disabled={busy}
              aria-current={selected === conversation.id ? "true" : undefined}
              onClick={() => onSelect(conversation.id)}
              className="text-secondary dark:text-secondary min-w-0 flex-1 rounded-xl px-3 py-3 text-start text-small hover:bg-gray-100 aria-[current=true]:bg-brand-50 aria-[current=true]:text-brand-600 dark:hover:bg-gray-800 dark:aria-[current=true]:bg-brand-950/40 dark:aria-[current=true]:text-brand-300"
            >
              <span className="block truncate">{conversation.title}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={t("deleteConversation")}
              onClick={() => onDelete(conversation.id)}
              className="text-muted dark:text-muted grid size-11 shrink-0 place-items-center rounded-lg hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-950/40 dark:hover:text-error-400"
            >
              <TrashIcon className="size-4" />
            </button>
          </div>
        ))}
        {!conversations.length && (
          <p className="text-muted dark:text-muted text-small">
            {t("noConversations")}
          </p>
        )}
      </div>
      <p className="text-muted dark:text-muted mt-4 text-caption">
        {t("privacyShort")}
      </p>
    </aside>
  );
}
