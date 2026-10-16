"use client";
import { useTranslations } from "next-intl";
import { CloseIcon, FileTextIcon, RefreshIcon } from "@/icons";
import { readableTypes, type Attachment } from "./useAttachments";
interface Props {
  items: Attachment[];
  canReadContent: boolean;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}
/** Attachment previews with upload progress, errors, retry and removal. */
export default function AttachmentList({ items, canReadContent, onRemove, onRetry }: Props) {
  const t = useTranslations("aven.attachments");
  if (!items.length) return null;
  return (
    <ul className="aven-attachments" aria-label={t("label")}>
      {items.map((item) => {
        const readable = readableTypes.has(item.mimeType);
        const note =
          item.status !== "ready"
            ? null
            : !readable
              ? t("notReadable")
              : canReadContent
                ? t("saved")
                : t("contentOff");
        return (
          <li key={item.key} className="aven-attachment" data-status={item.status}>
            {item.previewUrl ? (
              // A local object URL for the chosen image; nothing leaves the browser for the preview.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.previewUrl} alt="" className="aven-attachment-thumb" />
            ) : (
              <span className="aven-attachment-thumb" aria-hidden="true">
                <FileTextIcon className="aven-menu-icon" />
              </span>
            )}
            <span className="aven-attachment-text">
              <span className="aven-attachment-name">{item.name}</span>
              {item.status === "uploading" && (
                <span className="aven-attachment-progress">
                  <span
                    role="progressbar"
                    aria-label={t("uploading", { percent: item.progress })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.progress}
                    style={{ inlineSize: `${item.progress}%` }}
                  />
                </span>
              )}
              {item.status === "error" && (
                <span role="alert" className="aven-attachment-error">
                  {t.has(`errors.${item.error}`) ? t(`errors.${item.error}`) : t("errors.uploadFailed")}
                </span>
              )}
              {note && <span className="aven-attachment-note">{note}</span>}
            </span>
            {item.status === "error" && (
              <button type="button" className="aven-icon-button" aria-label={t("retry")} onClick={() => onRetry(item.key)}>
                <RefreshIcon className="size-4" />
              </button>
            )}
            <button
              type="button"
              className="aven-icon-button"
              aria-label={t("remove", { name: item.name })}
              onClick={() => onRemove(item.key)}
            >
              <CloseIcon className="size-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
