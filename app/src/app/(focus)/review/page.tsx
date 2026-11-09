import Link from "next/link";
import { requireActive } from "@/core/auth/session";
import { getQueue } from "@/modules/review/service";
import { ReviewSession } from "./session";

export const metadata = { title: "Преговор" };

export default async function Review({ searchParams }: { searchParams: Promise<{ more?: string; practice?: string }> }) {
  const sp = await searchParams;
  const { user } = await requireActive();
  const practice = sp.practice === "1";
  const more = Math.min(20, Math.max(0, Number(sp.more) || 0));
  const items = await getQueue(user.id, new Date(), { practice, more });

  if (!items.length) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5" style={{ paddingTop: "calc(var(--safe-top) + 24px)" }}>
        <div className="mt-24">
          <h1 className="text-2xl font-semibold tracking-tight">{practice ? "Няма думи за упражнение." : "Няма какво да се преговаря сега."}</h1>
          <p className="mt-3 max-w-[36ch] text-ink-2">Всичко за днес е минато или още не си добавил думи. Върни се по-късно: думите се връщат по график.</p>
        </div>
        <div className="mt-auto flex flex-col gap-2 pb-8">
          {!practice && <Link href="/review?practice=1" className="btn btn-secondary w-full">Упражнение: най-слабите думи</Link>}
          {!practice && <Link href="/review?more=10" className="btn btn-secondary w-full">Още 10 нови думи</Link>}
          <Link href="/words/new" className="btn btn-secondary w-full">Добави дума</Link>
          <Link href="/" className="btn btn-ghost w-full">Към началото</Link>
        </div>
      </div>
    );
  }
  return <ReviewSession items={items} practice={practice} />;
}
