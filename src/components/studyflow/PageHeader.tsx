import type { ReactNode } from "react";
interface Props { title: string; description?: string; action?: ReactNode }
/** A calm heading with one primary action. */
export default function PageHeader({ title, description, action }: Props) { return <header className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-title-sm font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">{description}</p>}</div>{action}</header>; }
