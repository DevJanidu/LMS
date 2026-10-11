import type { Resource } from "@/types";

export type LibraryView = "grid" | "list";
export const RESOURCE_PAGE_SIZE = 20;

export function libraryPages(page: number, pages: number) {
  return [...new Set([1, ...Array.from({ length: 5 }, (_, index) => page - 2 + index).filter(number => number > 1 && number < pages), pages])].sort((a, b) => a - b);
}

export function resourceHref(resource: Resource) {
  if (resource.type === "file") return `/api/files/${resource.id}`;
  return resource.url && /^https?:\/\//i.test(resource.url) ? resource.url : undefined;
}

export function youtubeId(url?: string): string | undefined {
  try {
    const value = new URL(url ?? "");
    const id = value.hostname === "youtu.be" ? value.pathname.split("/")[1]
      : ["youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"].includes(value.hostname)
        ? value.searchParams.get("v") ?? (/^\/(shorts|embed)\//.test(value.pathname) ? value.pathname.split("/")[2] : undefined)
        : undefined;
    return id && /^[\w-]{11}$/.test(id) ? id : undefined;
  } catch { return undefined; }
}

export function fileFormat(resource: Resource) {
  const formats: Record<string, string> = {
    "application/pdf": "PDF", "image/png": "PNG", "image/jpeg": "JPG", "text/plain": "TXT",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  };
  return formats[resource.mimeType ?? ""] ?? resource.title.match(/\.(pdf|png|jpe?g|docx|pptx|xlsx|txt)$/i)?.[1].toUpperCase();
}
