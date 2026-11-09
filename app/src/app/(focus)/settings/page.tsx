import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireActive } from "@/core/auth/session";
import { db } from "@/core/db";
import { profiles } from "@/core/db/schema";
import { IconBack } from "@/design/icons";
import { DailyNew } from "./daily-new";
import { PasswordForm } from "./password-form";
import { SignOutButton } from "./sign-out";
import { ThemeChoice } from "./theme-choice";

export const metadata = { title: "Настройки" };

export default async function Settings() {
  const { user } = await requireActive();
  const [profile] = await db.select({ n: profiles.dailyNewWords }).from(profiles).where(eq(profiles.id, user.id));
  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <header
        className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2"
        style={{ paddingTop: "var(--safe-top)", height: "calc(52px + var(--safe-top))" }}
      >
        <Link href="/" aria-label="Назад" className="grid h-11 w-11 place-items-center rounded-full text-ink-2 active:bg-surface">
          <IconBack />
        </Link>
        <h1 className="text-[17px] font-semibold">Настройки</h1>
      </header>

      <main className="space-y-10 px-5 pb-16 pt-6">
        <section aria-labelledby="acc">
          <h2 id="acc" className="text-sm text-ink-2">
            Акаунт
          </h2>
          <p className="mt-1 text-lg font-medium">{(user as { username?: string | null }).username ?? user.name}</p>
        </section>

        <section aria-labelledby="newwords">
          <h2 id="newwords" className="text-sm text-ink-2">
            Нови думи на ден
          </h2>
          <DailyNew initial={profile?.n ?? 8} />
          <p className="mt-2 text-[14px] text-ink-3">Колко нови думи да се добавят към преговора всеки ден. Можеш да поискаш още от края на преговора.</p>
        </section>

        <section aria-labelledby="theme">
          <h2 id="theme" className="text-sm text-ink-2">
            Тема
          </h2>
          <ThemeChoice />
        </section>

        <section aria-labelledby="pw" className="border-t border-line pt-8">
          <h2 id="pw" className="text-base font-semibold">
            Смяна на парола
          </h2>
          <PasswordForm />
        </section>

        <section className="border-t border-line pt-8">
          <SignOutButton />
        </section>
      </main>
    </div>
  );
}
