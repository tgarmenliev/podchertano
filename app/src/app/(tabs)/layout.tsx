import { requireSession } from "@/core/auth/session";
import { TabBar } from "@/design/tabbar";

export default async function TabsLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <>
      <div className="mx-auto min-h-dvh max-w-xl px-4 scroll-pad-bottom" style={{ paddingTop: "calc(var(--safe-top) + 12px)" }}>
        {children}
      </div>
      <TabBar />
    </>
  );
}
