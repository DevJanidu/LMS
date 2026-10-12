export default function Loading() {
  return (
    <div aria-busy="true" className="aven-workspace">
      <div className="aven-main justify-center">
        <div className="aven-column space-y-4">
          <div className="aven-skeleton mx-auto h-9 w-72 max-w-full" />
          <div className="aven-skeleton h-14" />
        </div>
      </div>
    </div>
  );
}
