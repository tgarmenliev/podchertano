/** Чиста проверка на лимитите (без база): лесна за тестване. */
export type BudgetState = { usedTodayByUser: number; usedMonthMicroEur: number };
export type BudgetLimits = { perUserDaily: number; monthlyCapEur: number };

export class BudgetError extends Error {
  constructor(
    public code: "daily_limit" | "monthly_cap",
    message: string,
  ) {
    super(message);
  }
}

export function assertWithinBudget(state: BudgetState, limits: BudgetLimits, estimatedMicroEur = 0) {
  if (state.usedTodayByUser >= limits.perUserDaily) throw new BudgetError("daily_limit", "Дневният лимит за автоматично попълване е изчерпан. Опитай утре или попълни ръчно.");
  if (state.usedMonthMicroEur + estimatedMicroEur >= limits.monthlyCapEur * 1_000_000) throw new BudgetError("monthly_cap", "Автоматичното попълване е временно спряно. Попълни думите ръчно.");
}
