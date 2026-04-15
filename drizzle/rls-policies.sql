-- Enable the pg_session_jwt extension (provided by Neon)
CREATE EXTENSION IF NOT EXISTS pg_session_jwt;

-- Enable Row Level Security on all tables
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE debug_overrides ENABLE ROW LEVEL SECURITY;

-- Characters: users can only read/write their own row
CREATE POLICY characters_user_policy ON characters
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

-- Game saves: users can only read/write their own row
CREATE POLICY game_saves_user_policy ON game_saves
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

-- Debug overrides: users can only read/write their own row
CREATE POLICY debug_overrides_user_policy ON debug_overrides
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());
