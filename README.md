# ABS Report Analyzer

A full-stack tool for analyzing ABS (Asset-Backed Securities) asset pools.
Upload a CSV → get structured AI-powered analysis with ESMA compliance flags and risk signals.

## Stack

TypeScript · Next.js 14 · Node.js · Effect-TS · PostgreSQL · Claude API · Docker

## Quick Start

```bash
git clone ...
cd abs-analyzer
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env, and an APP_ENCRYPTION_KEY (openssl rand -hex 32)
docker compose up

# App: http://localhost:3000
# API: http://localhost:3001
```

> The backend refuses to start without a 64-hex-char `APP_ENCRYPTION_KEY` (it encrypts
> users' stored provider API keys).

## Try It

Download the sample CSV from the app and upload it, or use `sample_data/sample_pool.csv`.

## Architecture

See [plan files/MVP_ARCHITECTURE.md](plan%20files/MVP_ARCHITECTURE.md) for the original design
and [plan files/PLATFORM_BUILD_PLAN.md](plan%20files/PLATFORM_BUILD_PLAN.md) for the platform phase.

## LLM model catalog (self-updating)

The model picker is not a hardcoded list. The backend builds it from live sources and
refreshes it daily, so new models appear (and retired ones disappear) without code changes:

1. **Provider List Models APIs** decide availability: Anthropic's `GET /v1/models` (with
   the server key) reports lifecycle (`active`/`deprecated`/`retired`) and capability flags.
   OpenAI/Gemini lists are used too when `OPENAI_API_KEY` / `GEMINI_API_KEY` are set.
2. **[models.dev](https://models.dev)** (open-source model metadata) supplies prices,
   tool-calling / structured-output support, output modalities and release dates. It is
   also the availability source for OpenAI/Gemini when the server holds no key for them.
3. **Curation** (`backend/src/ai/catalog/build.ts`) drops deprecated, non-text and
   incompatible models, keeps the newest release per family (a new version replaces its
   predecessor), caps each provider's list, and assigns High/Medium/Low cost tiers from
   relative list prices. The default model is the newest low-cost Claude model.
4. **Storage and refresh**: the result is stored in Postgres (`model_catalog`, last-known-
   good) and refreshed by a daily Vercel Cron (`/api/cron/refresh-models`) or lazily when
   older than 24 h. A failed refresh keeps the previous list, and a static seed list
   (`backend/src/ai/catalog/seed.ts`) is used only if nothing was ever stored.

Preview what the next refresh would produce: `cd backend && npm run catalog:preview`.

Tuning (all optional): `DEFAULT_MODEL` (pin the default, e.g. `claude-haiku-5-5`),
`MODEL_CATALOG_MAX_PER_PROVIDER` (default 6), `MODEL_CATALOG_TTL_HOURS` (default 24),
`MODEL_CATALOG_ALL_VERSIONS=true` (keep older versions of a family).

## Key Design Decisions

- **Why Effect-TS for validation** — typed error accumulation; every error on every row is
  collected in one pass instead of short-circuiting at the first failure.
- **Why Claude tool use instead of plain prompting** — forces a schema-typed JSON response
  that can be inserted straight into PostgreSQL, with guaranteed `severity` enums.
- **Why PostgreSQL over a simpler store** — the interesting queries on this data are
  relational (find all runs with an ESMA flag, or where delinquency exceeded 5%).
- **Deterministic math, AI judgment** — every number is computed in plain TypeScript and is
  exact and reproducible; the LLM only produces the qualitative layer (flags, risk, summary).

## Deploy to Vercel

The app deploys as **two Vercel projects from this repo** plus a hosted Postgres:

| Vercel project | Root Directory | What runs                                                    |
|----------------|----------------|--------------------------------------------------------------|
| backend        | `backend`      | Express app as a single Vercel Function (zero-config Express) |
| frontend       | `frontend`     | Next.js 14; browser `/api/*` calls go through a same-origin streaming proxy (`src/app/api/[...path]/route.ts`) so the session cookie is first-party |

Database: Neon Postgres via the Vercel Marketplace, connected to the **backend** project
(it injects `DATABASE_URL` and `DATABASE_URL_UNPOOLED`). Create it in the same region as
your Functions (default `iad1` / US East).

Environment variables:

| Project  | Variable             | Value                                                      |
|----------|----------------------|------------------------------------------------------------|
| backend  | `DATABASE_URL`       | set by the Neon integration (pooled URL)                    |
| backend  | `ANTHROPIC_API_KEY`  | platform demo key                                          |
| backend  | `APP_ENCRYPTION_KEY` | 64 hex chars (`openssl rand -hex 32`); keep it stable or stored BYOK keys become unreadable |
| backend  | `FRONTEND_ORIGIN`    | the frontend's production URL                              |
| backend  | `PROXY_SECRET`       | random string, same value as the frontend's                |
| backend  | `CRON_SECRET`        | random string; Vercel Cron sends it to `/api/cron/refresh-models` |
| backend  | `OPENAI_API_KEY`, `GEMINI_API_KEY` | optional; only used to list those providers' models |
| frontend | `API_URL`            | the backend's production URL (no trailing slash)           |
| frontend | `PROXY_SECRET`       | same value as the backend's                                |

Do **not** set `NEXT_PUBLIC_API_URL` on Vercel; leaving it unset makes the browser use the
same-origin proxy.

Apply the schema once to the fresh database:

```bash
cd backend
npx vercel@latest env pull .env.vercel --environment=production
npx tsx --env-file=.env.vercel scripts/migrate.ts   # idempotent; tracks schema_migrations
```

Limits to know: request bodies are capped at 4.5 MB (Vercel Functions), and a request can
run for at most 300 s on Hobby. The login throttle is per Function instance (in-memory).

## Services

| Service    | Port | Description                                  |
|------------|------|----------------------------------------------|
| `frontend` | 3000 | Next.js 14 App Router UI                      |
| `backend`  | 3001 | Express API (`GET /health`, analysis routes)  |
| `postgres` | 5432 | PostgreSQL 16; schema auto-applied on first start |
