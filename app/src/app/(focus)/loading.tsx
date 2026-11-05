export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Зареждане" className="mx-auto max-w-xl px-5" style={{ paddingTop: "calc(var(--safe-top) + 72px)" }}>
      <div className="h-4 w-32 rounded bg-surface-2" />
      <div className="mt-6 h-9 w-56 rounded bg-surface-2" />
      <div className="mt-4 h-5 w-full rounded bg-surface" />
      <div className="mt-2 h-5 w-3/4 rounded bg-surface" />
    </div>
  );
}
