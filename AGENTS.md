# Agent instructions for Audiobook Covers

Guidance for AI agents working in this repo.

## Package management

All packages are managed using pnpm.

## Commands

**All commands are run through the Taskfile.** Do not run `pnpm` scripts or `package.json` scripts directly. Use `task <name>`.

| Task                  | Purpose                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `task build`          | Build the app and check for type errors (use this after making changes) |
| `task lint`           | Run ESLint over the project                                             |
| `task lint:fix`       | Run ESLint and apply every fix it can make automatically                |
| `task format`         | Format the project with Prettier                                        |
| `task format:check`   | Fail if anything is unformatted, without rewriting it                   |
| `task dev`            | Start the dev server and Trigger.dev runner together (see below)        |
| `task trigger:dev`    | Start only the Trigger.dev local runner                                 |
| `task deploy:dev`     | Build and deploy to Cloudflare (development env)                        |
| `task deploy:prod`    | Build and deploy to production                                          |
| `task trigger:deploy` | Deploy Trigger.dev tasks to production                                  |

`task build` runs `wrangler types`, `tsc --noEmit`, and `vite build` in sequence, so it also regenerates `worker-configuration.d.ts` whenever you change `wrangler.jsonc`.

Tasks that touch a real database or secret store (`task env`, `db:push:dev`, `db:push:prod`, `db:populate`) use 1Password and are for human use; agents should not run them.

## You may not need to run the dev server

When interacting with a human, it is likely that they already have a dev server running. Check if they have a server running before starting your own.

## After making changes

**Always** run `task build` when you are done with a task. This builds the project and surfaces type errors.

Run `task lint` too. ESLint ignores build output and the generated files (`dist/`, `worker-configuration.d.ts`, `src/routeTree.gen.ts`), so it should report zero problems — keep it that way.

## Database

The schema is defined in Drizzle at `src/db/schema.ts`. There is no `database.sql`.

Changes are applied by the human with `drizzle-kit push` (`task db:push:dev` / `task db:push:prod`) after review — this project pushes the schema directly rather than generating migration files. Agents edit `src/db/schema.ts` and stop there; the human runs the push.

Everything lives in one PlanetScale Postgres database, split into a `dev` and a `prod` schema. `src/db/schema.ts` selects between them from `APP_STAGE`, so unqualified table names in raw SQL are dangerous — the ETL code qualifies its table names deliberately, and you should keep doing so.

## Project structure

- **Server entry**: `src/server.ts` (Worker entry), `src/router.tsx` (app router)
- **Routes**: `src/routes/` (file-based routing)
- **Server logic**: `src/server/` (auth, image search, analytics, image shaping)
- **Database**: schema in `src/db/schema.ts`; connection helpers in `src/db.ts`, with `src/db.cloudflare.ts` for Worker code and `src/db.node.ts` for Trigger.dev tasks and scripts
- **Embedding models**: `src/searchModels/`
- **Rerankers**: `src/server/rerankers/`
- **Background jobs**: `src/trigger/` (Trigger.dev v4; the OpenLibrary ETL lives in `src/trigger/openlibrary/` and is documented in `docs/openlibrary-etl.md`; the Reddit import lives in `src/trigger/reddit/` and is documented in `docs/reddit-import.md`)

## Environment

`src/env.ts` defines the schema for every environment variable and returns a proxy that throws on first access of a missing one. Two entry points wrap it: `src/env.node.ts` (reads `process.env`; used by Trigger.dev and scripts) and `src/env.cloudflare.ts` (reads the Worker env and prefers the Hyperdrive connection string).

If you add an environment variable, add it to `src/env.ts` — and remove it there when the code that used it goes away.

## Tanstack Start Important Information

If tanstack start has a code file with createServerFn exports and standard exports, it breaks tree shaking and proper server function running. If you create a file with both standard exports and createServerFn exports, you must refactor it so the server function exports are in a separate file. If you find a file you did not create with both types of exports, notify the user immediately and ask them to refactor it.

## Tech stack (reference)

- **Framework**: TanStack Start (React 19) with Vite
- **Deploy**: Cloudflare Workers (Wrangler), with Hyperdrive in front of Postgres
- **Styling**: Tailwind CSS v4, shadcn-style components in `src/components/ui/`
- **Database**: Postgres, hosted on PlanetScale
- **Search**: pgvector similarity over Jina CLIP v2 embeddings, plus Postgres full-text search over OpenLibrary metadata
- **Background jobs**: Trigger.dev v4
- **Analytics**: PostHog
