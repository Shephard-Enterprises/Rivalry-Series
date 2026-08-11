# Supabase setup

1. Link this folder to the existing Supabase project with the Supabase CLI.
2. Apply `migrations/202608100001_initial_schema.sql`.
3. Create Justin and Luke through Supabase Auth, then insert matching `profiles` rows.
4. Copy `.env.example` to `.env.local` and add the project URL and publishable anon key.

The frontend remains in demo mode when those variables are absent. Draft picks use an atomic, server-validated transaction and are realtime-ready. The automatic deadline worker should be added after real NFL player identifiers and rankings are selected.
