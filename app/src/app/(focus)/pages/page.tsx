import Image from "next/image";
import Link from "next/link";
import { requireActive } from "@/core/auth/session";
import { IconBack, IconChevron } from "@/design/icons";
import { listSources } from "@/modules/scan/service";

export const metadata = { title: "Страници" };

const fmt = new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" });

export default async function Pages() {
  const { user } = await requireActive();
  const list = await listSources(user.id);
  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2" style={{ paddingTop: "var(--safe-top)", height: "calc(52px + var(--safe-top))" }}>
        <Link href="/words" aria-label="Назад" className="grid h-11 w-11 place-items-center rounded-full text-ink-2 active:bg-surface">
          <IconBack />
        </Link>
        <h1 className="flex-1 text-[17px] font-semibold">Страници</h1>
        <Link href="/scan" className="btn btn-secondary !min-h-11 !px-4 text-[15px]">Нова</Link>
      </header>
      <main className="px-5 pb-16 pt-4">
        {list.length === 0 ? (
          <div className="pt-6">
            <p className="max-w-[30ch] text-lg font-medium">Още няма снимани страници.</p>
            <p className="mt-2 max-w-[40ch] text-ink-2">Всяка страница, която снимаш, се пази тук заедно с думите от нея, за да можеш да се върнеш към текста.</p>
            <Link href="/scan" className="btn btn-primary mt-6">Снимай страница</Link>
          </div>
        ) : (
          <ul className="stagger divide-y divide-line border-y border-line">
            {list.map((p) => (
              <li key={p.id}>
                <Link href={`/pages/${p.id}`} className="flex items-center gap-4 py-3 active:bg-surface">
                  <Image src={`/api/sources/${p.id}/image`} alt="" width={48} height={64} unoptimized className="h-16 w-12 shrink-0 rounded-[4px] border border-line object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="text-sm text-ink-2">{p.words} {p.words === 1 ? "дума" : "думи"} · {fmt.format(p.createdAt)}</p>
                  </div>
                  <IconChevron width={20} height={20} className="text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
