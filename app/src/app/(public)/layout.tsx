export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto flex min-h-dvh max-w-xl flex-col px-6"
      style={{ paddingTop: "calc(var(--safe-top) + 24px)", paddingBottom: "max(var(--safe-bottom), 24px)" }}
    >
      {children}
    </div>
  );
}
