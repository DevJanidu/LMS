export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <div className="h-12 w-48 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-44 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-800"
          />
        ))}
      </div>
    </div>
  );
}
