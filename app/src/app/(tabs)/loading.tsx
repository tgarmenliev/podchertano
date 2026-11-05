/* Показва се мигновено при докосване на раздел, докато идват данните. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Зареждане" className="pt-2">
      <div className="h-8 w-40 rounded bg-surface-2" />
      <div className="mt-10 h-14 w-24 rounded bg-surface-2" />
      <div className="mt-4 h-4 w-56 rounded bg-surface" />
      <div className="mt-8 h-12 w-full rounded-[var(--radius-m)] bg-surface-2" />
      <div className="mt-10 space-y-3">
        <div className="h-14 w-full rounded bg-surface" />
        <div className="h-14 w-full rounded bg-surface" />
        <div className="h-14 w-full rounded bg-surface" />
      </div>
    </div>
  );
}
