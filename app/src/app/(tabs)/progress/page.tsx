export const metadata = { title: "Напредък" };

export default function Progress() {
  return (
    <main>
      <h1 className="py-3 text-2xl font-semibold tracking-tight">Напредък</h1>
      <div className="mt-6 border-t border-line pt-8">
        <p className="max-w-[30ch] text-lg font-medium">Още няма какво да се покаже.</p>
        <p className="mt-2 max-w-[40ch] text-ink-2">
          След първия преговор тук ще виждаш колко думи са нови, колко са в учене и колко вече знаеш.
        </p>
      </div>
    </main>
  );
}
