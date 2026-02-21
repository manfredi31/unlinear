# ISS-2: Create Supabase schema for user profiles

## Context
Set up the core `profiles` table in Supabase with proper RLS so the app can store user data securely.

## Acceptance Criteria
- [ ] `profiles` table created with id, email, display_name, avatar_url
- [ ] RLS enabled — users can only read/write their own row
- [ ] Migration file committed
