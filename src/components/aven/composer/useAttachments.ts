"use client";
import { useCallback, useRef, useState } from "react";
import { createUpload, finishUpload } from "@/app/[locale]/file-actions";
import { runServerAction } from "@/lib/client/server-actions";
import { uploadTypes } from "@/lib/validation";
export interface Attachment {
  key: string;
  name: string;
  mimeType: string;
  subjectId: string;
  status: "uploading" | "ready" | "error";
  progress: number;
  error?: string;
  /** The saved library resource; sent to Aven as a structured reference. */
  resourceId?: string;
  title: string;
  previewUrl?: string;
}
export const MAX_ATTACHMENTS = 5;
/** Aven can read these formats (with resource access allowed); others are stored only. */
export const readableTypes = new Set(["application/pdf", "text/plain"]);
export const acceptedTypes = Object.entries(uploadTypes)
  .flatMap(([mime, extensions]) => [mime, ...extensions.map((ext) => `.${ext}`)])
  .join(",");
/** PUT with progress events; fetch cannot report upload progress. */
function put(url: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("uploadFailed")));
    request.onerror = () => reject(new Error("uploadFailed"));
    request.onabort = () => reject(new Error("aborted"));
    signal.addEventListener("abort", () => request.abort());
    request.send(file);
  });
}
/**
 * Chat attachments through the existing library upload flow: the server validates type,
 * size, storage quota and subject ownership, then the file becomes a library resource.
 */
export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const patch = (key: string, value: Partial<Attachment>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...value } : item)));
  const upload = useCallback(async (key: string, file: File, subjectId: string, title: string) => {
    const controller = new AbortController();
    controllers.current.set(key, controller);
    patch(key, { status: "uploading", progress: 0, error: undefined, subjectId });
    try {
      const created = await runServerAction(() =>
        createUpload({ subjectId, title, name: file.name, mimeType: file.type, sizeBytes: file.size }),
      );
      if (!created.ok) throw new Error(created.error);
      await put(created.data.url, file, (progress) => patch(key, { progress }), controller.signal);
      const finished = await runServerAction(() => finishUpload(created.data.id));
      if (!finished.ok) throw new Error(finished.error);
      const resource = (finished.data as { resource?: { id: string } }).resource;
      if (!resource?.id) throw new Error("uploadFailed");
      patch(key, { status: "ready", progress: 100, resourceId: resource.id });
    } catch (error) {
      if (controller.signal.aborted) return;
      patch(key, { status: "error", error: error instanceof Error ? error.message : "uploadFailed" });
    } finally {
      controllers.current.delete(key);
    }
  }, []);
  const files = useRef(new Map<string, File>());
  const add = useCallback(
    (list: FileList | File[], subjectId: string) => {
      const chosen = [...list].slice(0, Math.max(0, MAX_ATTACHMENTS - items.length));
      for (const file of chosen) {
        const key = crypto.randomUUID();
        const title = file.name.replace(/\.[^.]+$/, "").slice(0, 150) || file.name.slice(0, 150);
        files.current.set(key, file);
        setItems((current) => [
          ...current,
          {
            key,
            name: file.name,
            mimeType: file.type,
            subjectId,
            status: "uploading",
            progress: 0,
            title,
            previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
          },
        ]);
        void upload(key, file, subjectId, title);
      }
    },
    [items.length, upload],
  );
  const retry = useCallback(
    (key: string, subjectId?: string) => {
      const file = files.current.get(key);
      const item = items.find((entry) => entry.key === key);
      if (file && item) void upload(key, file, subjectId ?? item.subjectId, item.title);
    },
    [items, upload],
  );
  /** Detaches from the message. A finished upload stays in the library, as the chip says. */
  const remove = useCallback((key: string) => {
    controllers.current.get(key)?.abort();
    files.current.delete(key);
    setItems((current) => {
      const item = current.find((entry) => entry.key === key);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.key !== key);
    });
  }, []);
  const clear = useCallback(() => {
    for (const controller of controllers.current.values()) controller.abort();
    files.current.clear();
    setItems((current) => {
      for (const item of current) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
  }, []);
  return { items, add, retry, remove, clear, busy: items.some((item) => item.status === "uploading") };
}
