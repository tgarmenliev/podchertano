/* Статус на дума: нова = светла вълничка, в учене = вълничка, усвоена = права линия (вълничката се изглажда). */
export function StatusMark({ status }: { status: "new" | "learning" | "known" }) {
  const label = { new: "нова", learning: "в учене", known: "усвоена" }[status];
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-ink-2">
      {status === "known" ? (
        <span className="block h-[2px] w-7 rounded bg-accent" aria-hidden />
      ) : (
        <span className="wave-line block w-7" style={{ height: 6, opacity: status === "new" ? 0.35 : 1 }} aria-hidden />
      )}
      {label}
    </span>
  );
}
