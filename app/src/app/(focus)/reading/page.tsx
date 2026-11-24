import Link from "next/link";
import { aiEnabled } from "@/core/ai/config";
import { requireActive } from "@/core/auth/session";
import type { ReadingQuestion } from "@/core/ai/reading";
import { latestUnread, type ReadingWord } from "@/modules/reading/service";
import { Generating } from "./generating";
import { ReadingSession } from "./session";

export const metadata = { title: "Твоят текст" };
/** Текстът се прави с AI (15–25 s); действието се изпълнява в рамките на тази страница. */
export const maxDuration = 60;

export default async function ReadingPage() {
  const { user } = await requireActive();
  const shell = (children: React.ReactNode) => (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5" style={{ paddingTop: "calc(var(--safe-top) + 24px)", paddingBottom: "max(var(--safe-bottom), 24px)" }}>
      {children}
    </div>
  );
  if (!aiEnabled()) {
    return shell(
      <>
        <h1 className="mt-24 text-2xl font-semibold tracking-tight">Текстовете още не са включени.</h1>
        <Link href="/" className="btn btn-primary mt-auto w-full">Към началото</Link>
      </>,
    );
  }
  const r = await latestUnread(user.id);
  if (!r) return <Generating />;
  return (
    <ReadingSession
      reading={{ id: r.id, title: r.title, paragraphs: r.body.split(/\n\n+/), words: r.words as ReadingWord[], questions: r.questions as ReadingQuestion[] }}
    />
  );
}
