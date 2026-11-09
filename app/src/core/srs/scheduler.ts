import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card } from "ts-fsrs";

/*
  Тънка обвивка около ts-fsrs. Една и съща логика на клиента (офлайн) и на сървъра.
  Редът в базата (srs_cards) се превръща в Card и обратно.
*/
export type CardRow = {
  due: Date;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: Date | null;
};

// без „fuzz“: предвидимо за тестове; желана задържаемост 90%
const scheduler = fsrs(generatorParameters({ enable_fuzz: false, request_retention: 0.9 }));

export const toCard = (r: CardRow): Card => ({
  due: r.due,
  stability: r.stability,
  difficulty: r.difficulty,
  scheduled_days: r.scheduledDays,
  learning_steps: r.learningSteps,
  reps: r.reps,
  lapses: r.lapses,
  state: r.state as State,
  last_review: r.lastReview ?? undefined,
});

export const fromCard = (c: Card): CardRow => ({
  due: c.due,
  stability: c.stability,
  difficulty: c.difficulty,
  scheduledDays: c.scheduled_days,
  learningSteps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  lastReview: c.last_review ?? null,
});

export const newCardRow = (now = new Date()): CardRow => fromCard(createEmptyCard(now));

/** rating: 1 Again, 2 Hard, 3 Good, 4 Easy */
export function review(row: CardRow, rating: 1 | 2 | 3 | 4, now: Date): CardRow {
  const grade = ({ 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy } as const)[rating];
  return fromCard(scheduler.next(toCard(row), now, grade).card);
}

/**
 * Автоматична оценка от резултата (без бутони за „лесно/трудно“).
 * „Лесно“ (4): вярно, без подсказка, написано бързо; не важи за избор от отговори и за нови думи.
 */
export function ratingFromResult(r: { verdict: "correct" | "almost" | "wrong"; hintUsed: boolean; fast?: boolean }): 1 | 2 | 3 | 4 {
  if (r.verdict === "wrong") return 1;
  if (r.verdict === "almost" || r.hintUsed) return 2;
  return r.fast ? 4 : 3;
}

/** Бърз отговор: до 2,5 s плюс 0,25 s на буква (колкото да се напише). */
export const isFast = (durationMs: number, letters: number) => durationMs <= 2500 + 250 * letters;

/** Дума е „усвоена“, когато картата е в преговор и паметта ѝ издържа поне 21 дни. */
export const isKnown = (row: Pick<CardRow, "state" | "stability">) => row.state === State.Review && row.stability >= 21;

export const statusOf = (row: Pick<CardRow, "state" | "stability">): "new" | "learning" | "known" =>
  row.state === State.New ? "new" : isKnown(row) ? "known" : "learning";
