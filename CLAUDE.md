@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Next.js dev server (Turbopack)
npm run build        # Production build — also runs full TypeScript check
npm run lint         # ESLint (flat config in eslint.config.mjs)

# Prisma — DATABASE_URL must be set in the environment, NOT just .env.local
# (Prisma CLI does not auto-load .env.local). The dev DB lives at prisma/dev.db.
DATABASE_URL="file:./prisma/dev.db" npx prisma migrate dev --name <change>
DATABASE_URL="file:./prisma/dev.db" npx prisma db push        # sync schema without a migration
DATABASE_URL="file:./prisma/dev.db" npx prisma migrate status

# Seed default categories (required after fresh DB)
DATABASE_URL="file:./prisma/dev.db" npx tsx prisma/seed.ts

# Create the admin account — reads ADMIN_EMAIL / ADMIN_PASSWORD from .env.local itself
npx tsx scripts/create-admin.ts
```

There is no test suite configured.

## Architecture

### Next.js 16 specifics
- **`proxy.ts` replaces `middleware.ts`** (renamed in Next.js 16). It composes `next-intl` routing with NextAuth session checks. The matcher excludes `_next`, `api`, and static files — `/api/*` routes must never be locale-prefixed.
- React 19, Tailwind v4 with `@custom-variant dark (&:where(.dark, .dark *));` declared in `app/globals.css` (do not use the older `@variant` form).
- Read `node_modules/next/dist/docs/` before relying on training-data knowledge — APIs have shifted.

### Routing & i18n
- All user-facing pages live under `app/[locale]/...` with locales `th` (default) and `en` — defined in `lib/i18n.ts`. `next-intl` uses `localePrefix: 'always'`, so every page URL carries `/th` or `/en`.
- Authenticated app shell is the `(app)` route group: `app/[locale]/(app)/{dashboard,transactions,reports,budget,settings,admin}`.
- API routes under `app/api/*` are **not** locale-prefixed and must stay outside the `[locale]` segment.

### Auth
- NextAuth v5 (beta) with Credentials provider + JWT sessions. `lib/auth.ts` exports `auth`, `handlers`, `signIn`, `signOut`. The JWT carries `id` and `role` — read `session.user.role` to gate admin endpoints/UI.
- Passwords are bcrypt-hashed. The admin account is created out-of-band via `scripts/create-admin.ts`; members self-register through `/api/users/register`.

### AI layer (`lib/ai/`)
- **Only OpenRouter is supported** — `AIProvider` is a string union with a single value `'openrouter'`. `providers.ts` is the single source of truth. `OPENROUTER_FREE_MODELS` is the master list; `OPENROUTER_FREE_VISION_MODELS` and `OPENROUTER_FREE_TEXT_MODELS` are filtered views. `hasKey()` checks whether a server or per-user key exists.
- **Two call patterns, never mix them:**
  - `runWithOpenRouterFallback(apiKey, preferred, run, needsVision?)` — used by the chat route. Builds a model chain (preferred first, then fallbacks) and retries on rate-limit or failure. `run` receives `(modelId, model)`.
  - `getAIModel(provider, apiKey?, model?)` — used by the analyze route for one-shot vision calls.
- Never call `createOpenAI` directly from routes; use the helpers above.
- OpenRouter uses `@ai-sdk/openai` with `baseURL: 'https://openrouter.ai/api/v1'` (no `compatibility: 'compatible'` flag currently set).
- `analyze.ts` wraps `generateObject` with a Zod schema and `mode: 'json'` (free models don't support structured outputs). The category name is fuzzy-matched against the user's `Category` rows in the API route.
- `chat-tools.ts` exports `createChatTools(userId)` which returns `{ tools, mutated }`. The five tools (`addTransaction`, `deleteRecentTransaction`, `setBudget`, `getSummary`, `listRecentTransactions`) run server-side inside `generateText` with `stopWhen: stepCountIs(5)`. `mutated.changed` is set to `true` by any write tool — the chat route returns `dbChanged: true` in its response when this happens.

### Data-refresh pattern
- Pages that display live data import `useDataRefresh` from `@/lib/hooks/useDataRefresh`. When the AI chat widget receives `dbChanged: true`, it calls `emitDataChanged()` which dispatches a `app:data-changed` CustomEvent on `window`. Pages listen via `useDataRefresh(callback)` and re-fetch. Always wire new pages that display data the AI can mutate to this hook.

### Data model (`prisma/schema.prisma`)
- SQLite via Prisma 6 (Prisma 7 is incompatible — it removed the `url` field from datasources used here).
- `User` carries per-user AI config (`aiProvider`, `aiModel`, `aiApiKey`) and i18n prefs (`language`, `currency`). `role` is a free-form string but only `'admin'` and `'member'` are used.
- `Category` rows with `isDefault: true` and `userId: null` are shared defaults seeded by `prisma/seed.ts`; per-user categories scope by `userId`. Transaction lookups should `OR` these two cases.

### Prisma client
- Always import `prisma` from `@/lib/db/prisma` (singleton across HMR reloads). After editing the schema or running `db push`, the dev server must be restarted — Next.js does not pick up the regenerated `@prisma/client` via HMR, and stale clients surface as `Unknown field` errors at runtime even though the DB and schema agree.

### UI conventions
- Responsive shell: desktop `Sidebar` (`hidden md:flex`) + mobile `BottomNav` (`md:hidden`).
- `next-themes` drives dark mode via the `.dark` class on `<html>`.
- User confirmations use `sweetalert2` (`Swal.fire`); toast notifications use `sonner`.

### Required environment variables (`.env.local`)
`DATABASE_URL`, `NEXTAUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `OPENROUTER_API_KEY`. The OpenRouter key can also be supplied per-user via settings (`aiApiKey` on `User`). `hasKey()` checks both; if neither is present the AI features are disabled.
