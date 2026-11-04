-- Допълнение към генерираната миграция (изпълнява се след нея).
-- 1) profiles.id е Supabase auth uid
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_auth_fk" FOREIGN KEY ("id") REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2) Включваме RLS навсякъде. Без политики анонимният и автентикираният ключ на Supabase
--    не виждат нищо; цялата работа с данните минава през сървъра (с ролята на базата).
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invite_redemptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vocab_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "encounters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "srs_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "review_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;

-- 3) Всеки потребител чете само собствения си профил (за случаи с директен достъп от клиента).
CREATE POLICY "profiles_select_own" ON "profiles" FOR SELECT USING (id = auth.uid());
