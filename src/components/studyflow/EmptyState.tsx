import type { ReactNode } from "react";
interface Props { title: string; description?: string; action?: ReactNode }
/** Friendly guidance for empty collections and filtered results. */
export default function EmptyState({ title, description, action }: Props) { return <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-900"><h2 className="text-lg font-medium text-gray-800 dark:text-white">{title}</h2>{description && <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">{description}</p>}<div className="mt-5">{action}</div></div>; }
