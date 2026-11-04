import Link from "next/link";

export const metadata = { title: "Речник" };

export default function Words() {
  return (
    <main>
      <h1 className="py-3 text-2xl font-semibold tracking-tight">Речник</h1>
      <div className="mt-6 border-t border-line pt-8">
        <p className="max-w-[30ch] text-lg font-medium">Тук ще се събират думите, които подчертаеш.</p>
        <p className="mt-2 max-w-[40ch] text-ink-2">
          Всяка дума ще е с превод, значение и изречението от страницата, в което си я срещнал.
        </p>
        <Link href="/pick" className="btn btn-primary mt-6">
          Снимай първата страница
        </Link>
      </div>
    </main>
  );
}
