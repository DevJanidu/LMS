"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileIcon, LinkIcon, PlayIcon } from "@/icons";
import type { Resource } from "@/types";
import { fileFormat, youtubeId, type LibraryView } from "./resourcePresentation";

interface Props { resource: Resource; view: LibraryView }

export default function ResourcePreview({ resource, view }: Props) {
  const t = useTranslations("studyflow");
  const [failed, setFailed] = useState(false);
  const id = youtubeId(resource.url);
  const video = resource.type === "video";
  const colors = {
    file: "bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300",
    video: "bg-gray-900 text-white dark:bg-gray-950 dark:text-white",
    link: "bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-950/40 dark:text-blue-light-300",
    note: "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300",
  };
  const dimensions = view === "grid" ? video ? "aspect-video w-full" : "aspect-square w-full"
    : video ? "aspect-video w-32 shrink-0 sm:w-44" : "size-20 shrink-0";
  const Icon = video ? PlayIcon : resource.type === "link" ? LinkIcon : FileIcon;

  return <div aria-hidden="true" className={`relative grid place-items-center overflow-hidden rounded-xl ${dimensions} ${colors[resource.type]}`}>
    {video && id && !failed && <Image src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" fill unoptimized sizes="(max-width: 639px) 100vw, 400px" onError={() => setFailed(true)} className="object-cover" />}
    {video ? <span className="relative grid size-12 place-items-center rounded-full bg-gray-950/60 text-white shadow-theme-md dark:bg-gray-950/60 dark:text-white"><PlayIcon className="size-6" /></span>
      : <div className="flex flex-col items-center gap-3">
        <div className={`grid place-items-center rounded-2xl bg-white/80 shadow-theme-sm dark:bg-gray-900/80 ${view === "grid" ? "size-20" : "size-12"}`}><Icon className={view === "grid" ? "size-10" : "size-6"} /></div>
        {view === "grid" && <span className="rounded-lg bg-white/70 px-3 py-1 text-overline dark:bg-gray-900/70">{resource.type === "file" ? fileFormat(resource) ?? t("file") : t(resource.type)}</span>}
      </div>}
    {resource.type === "file" && view === "list" && fileFormat(resource) && <span className="absolute bottom-1 rounded bg-white px-1 text-theme-xs dark:bg-gray-900">{fileFormat(resource)}</span>}
  </div>;
}
