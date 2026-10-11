export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <div className="h-12 w-48 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" />
      <div className="h-96 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-800" />
    </div>
  );
}
