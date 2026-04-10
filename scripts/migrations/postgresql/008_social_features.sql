-- File: scripts/migrations/postgresql/008_social_features.sql
-- Migration 008: Social features — friendships, presence, profile extensions
-- Enables friend requests, online/offline status, accessibility & i18n prefs.

BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = 8) THEN
    RAISE NOTICE 'Migration 008 already applied — skipping';
    RETURN;
  END IF;

  -- ══════════════════════════════════════════════════════════════════
  -- 1. Friendships table
  -- ══════════════════════════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS public.friendships (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id  UUID NOT NULL,
    addressee_id  UUID NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','accepted','declined','blocked')),
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE (requester_id, addressee_id),
    CHECK  (requester_id <> addressee_id)
  );

  CREATE INDEX IF NOT EXISTS idx_friendships_requester ON public.friendships(requester_id);
  CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON public.friendships(addressee_id);

  ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

  -- Users can see friendships they're part of
  CREATE POLICY friendships_select ON public.friendships
    FOR SELECT TO authenticated USING (
      requester_id = auth.uid() OR addressee_id = auth.uid()
    );

  -- Users can create friend requests (as requester)
  CREATE POLICY friendships_insert ON public.friendships
    FOR INSERT TO authenticated WITH CHECK (
      requester_id = auth.uid()
    );

  -- Users can update friendships addressed to them (accept/decline/block)
  CREATE POLICY friendships_update ON public.friendships
    FOR UPDATE TO authenticated USING (
      addressee_id = auth.uid() OR requester_id = auth.uid()
    );

  -- Users can delete their own friendships
  CREATE POLICY friendships_delete ON public.friendships
    FOR DELETE TO authenticated USING (
      requester_id = auth.uid() OR addressee_id = auth.uid()
    );

  GRANT ALL ON public.friendships TO authenticated;

  -- ══════════════════════════════════════════════════════════════════
  -- 2. User presence table
  -- ══════════════════════════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS public.user_presence (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID UNIQUE NOT NULL,
    status       TEXT NOT NULL DEFAULT 'offline'
                   CHECK (status IN ('online','away','offline')),
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    metadata     JSONB DEFAULT '{}'::jsonb
  );

  ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

  -- Everyone authenticated can see presence
  CREATE POLICY presence_select ON public.user_presence
    FOR SELECT TO authenticated USING (true);

  -- Users can only update their own presence
  CREATE POLICY presence_upsert ON public.user_presence
    FOR ALL TO authenticated USING (user_id = auth.uid());

  GRANT ALL ON public.user_presence TO authenticated;

  -- ══════════════════════════════════════════════════════════════════
  -- 3. Extend user_profiles table
  -- ══════════════════════════════════════════════════════════════════
  -- Add columns if they don't already exist
  ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS language     TEXT DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS theme        TEXT DEFAULT 'system'
                                            CHECK (theme IN ('light','dark','system')),
    ADD COLUMN IF NOT EXISTS a11y_preferences JSONB DEFAULT '{
      "high_contrast": false,
      "reduced_motion": false,
      "font_size": "medium",
      "screen_reader_optimized": false
    }'::jsonb,
    ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
      "email": true,
      "push": true,
      "in_app": true
    }'::jsonb;

  -- Allow users to update their own extended profile
  DROP POLICY IF EXISTS user_profiles_update_own ON public.user_profiles;
  CREATE POLICY user_profiles_update_own ON public.user_profiles
    FOR UPDATE TO authenticated USING (user_id = auth.uid());

  DROP POLICY IF EXISTS user_profiles_insert_own ON public.user_profiles;
  CREATE POLICY user_profiles_insert_own ON public.user_profiles
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

  -- ══════════════════════════════════════════════════════════════════
  -- 4. Auto-create profile + presence on user signup
  -- ══════════════════════════════════════════════════════════════════
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER AS $fn$
  BEGIN
    INSERT INTO public.user_profiles (user_id, display_name, avatar_url)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/initials/svg?seed=' || split_part(NEW.email, '@', 1))
    )
    ON CONFLICT DO NOTHING;

    INSERT INTO public.user_presence (user_id, status)
    VALUES (NEW.id, 'offline')
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
  END;
  $fn$ LANGUAGE plpgsql SECURITY DEFINER;

  DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
  CREATE TRIGGER trg_handle_new_user
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

  -- Record migration
  INSERT INTO schema_migrations (version, name) VALUES (8, '008_social_features');

END $$;

COMMIT;
