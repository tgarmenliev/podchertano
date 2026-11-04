import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
  Модел на данните (план, раздел 3).
  Всеки запис на потребител е вързан с user_id. profiles.id е auth uid (FK към user.id).
*/

/* ───────── Таблици на Better Auth (вход) ───────── */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  /** потребителско име за вход (малки букви; плъгин username на Better Auth) */
  username: text("username").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Ограничаване на опитите за вход (Better Auth, storage: "database"): работи и на много сървъри. */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ───────── Приложение ───────── */
export const profiles = pgTable("profiles", {
  id: text("id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  status: text("status", { enum: ["pending", "active", "blocked"] }).notNull().default("pending"),
  role: text("role", { enum: ["student", "owner"] }).notNull().default("student"),
  timezone: text("timezone").notNull().default("Europe/Sofia"),
  dailyPhotoLimit: integer("daily_photo_limit").notNull().default(5),
  dailyNewWords: integer("daily_new_words").notNull().default(8),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invites = pgTable("invites", {
  code: text("code").primaryKey(),
  createdBy: text("created_by"),
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inviteRedemptions = pgTable("invite_redemptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().references(() => invites.code),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/** Една заснета страница. Снимката е компресирана копие в частен bucket (image_path). */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("reading_photo"),
    title: text("title"),
    fullText: text("full_text"),
    /** [{i, text, box, auto_flag, auto_score, final_flag}] */
    words: jsonb("words"),
    imagePath: text("image_path"),
    imageW: integer("image_w"),
    imageH: integer("image_h"),
    pipelineVersion: text("pipeline_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sources_user_created_idx").on(t.userId, t.createdAt)],
);

export const vocabItems = pgTable(
  "vocab_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    lemma: text("lemma").notNull(),
    pos: text("pos").notNull().default(""),
    phrase: text("phrase"),
    phraseKind: text("phrase_kind", { enum: ["phrasal_verb", "idiom", "collocation"] }),
    translationBg: text("translation_bg").notNull(),
    translationAltBg: text("translation_alt_bg"),
    meaningBg: text("meaning_bg"),
    definitionEn: text("definition_en"),
    exampleEn: text("example_en"),
    cefrGuess: text("cefr_guess"),
    notes: text("notes"),
    status: text("status", { enum: ["new", "learning", "known", "suspended"] }).notNull().default("new"),
    aiModel: text("ai_model"),
    enrichVersion: text("enrich_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vocab_items_unique_idx").on(t.userId, t.lemma, t.pos, sql`coalesce(${t.phrase}, '')`),
    index("vocab_items_user_status_idx").on(t.userId, t.status),
  ],
);

/** Къде е срещната думата (една дума, много контексти). */
export const encounters = pgTable(
  "encounters",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    vocabItemId: uuid("vocab_item_id").notNull().references(() => vocabItems.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    surfaceForm: text("surface_form").notNull(),
    sentence: text("sentence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("encounters_item_idx").on(t.vocabItemId)],
);

/** Полиморфни карти за повторение: речникът сега, „грешки“ и други по-късно. */
export const srsCards = pgTable(
  "srs_cards",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    itemKind: text("item_kind").notNull().default("vocab"),
    itemId: uuid("item_id").notNull(),
    due: timestamp("due", { withTimezone: true }).notNull().defaultNow(),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    state: integer("state").notNull().default(0), // 0 New, 1 Learning, 2 Review, 3 Relearning (ts-fsrs)
    lastReview: timestamp("last_review", { withTimezone: true }),
    suspended: boolean("suspended").notNull().default(false),
  },
  (t) => [
    uniqueIndex("srs_cards_item_idx").on(t.userId, t.itemKind, t.itemId),
    index("srs_cards_due_idx").on(t.userId, t.due),
  ],
);

/** Само добавяне. id е от клиента (uuid), затова синхронизацията е идемпотентна. */
export const reviewLogs = pgTable(
  "review_logs",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    cardId: uuid("card_id").notNull().references(() => srsCards.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: ["recognize", "type_from_bg", "cloze"] }).notNull(),
    rating: integer("rating").notNull(), // 1 Again, 2 Hard, 3 Good, 4 Easy
    correct: boolean("correct").notNull(),
    typedAnswer: text("typed_answer"),
    durationMs: integer("duration_ms"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
    cardStateBefore: jsonb("card_state_before"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_logs_user_time_idx").on(t.userId, t.reviewedAt)],
);

/** Контрол на разходите (план, раздел 5). Сумите са в микро-евро. */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").references(() => profiles.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["ocr", "detect", "enrich"] }).notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    images: integer("images"),
    estCostMicroEur: integer("est_cost_micro_eur").notNull().default(0),
    ok: boolean("ok").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_user_time_idx").on(t.userId, t.createdAt)],
);
