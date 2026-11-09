import Link from "next/link";
import { aiEnabled } from "@/core/ai/config";
import { requireActive } from "@/core/auth/session";
import { IconBack } from "@/design/icons";
import { NewWordForm } from "./form";

export const metadata = { title: "Нова дума" };

export default async function NewWord() {
  await requireActive();
  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2" style={{ paddingTop: "var(--safe-top)", height: "calc(52px + var(--safe-top))" }}>
        <Link href="/words" aria-label="Назад" className="grid h-11 w-11 place-items-center rounded-full text-ink-2 active:bg-surface">
          <IconBack />
        </Link>
        <h1 className="text-[17px] font-semibold">Нова дума</h1>
      </header>
      <main className="px-5 pb-16 pt-6">
        <NewWordForm aiAvailable={aiEnabled()} />
      </main>
    </div>
  );
}
