# Rivalry Series

A private, two-manager weekly fantasy football competition built with React, Vite, and Supabase.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app runs in demo mode when Supabase environment variables are absent.

## Validation

```bash
npm run lint
npm run build
```

## Deployment

Pushes to `main` deploy automatically to GitHub Pages. The workflow contains only the browser-safe Supabase project URL and publishable key. Never add a Supabase secret or service-role key to frontend code.

Production URL: `https://shephard-enterprises.github.io/Rivalry-Series/`

## Database

Supabase migrations live in `supabase/migrations`. Apply pending migrations with:

```bash
npx supabase db push
```
