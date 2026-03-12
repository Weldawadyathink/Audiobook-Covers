# Agent instructions for Audiobook Covers

Guidance for AI agents working in this repo.

## Package management

All packages are managed using pnpm.

## Commands

**All commands are run through the Taskfile.** Do not run `pnpm` scripts or `package.json` scripts directly. Use `task <name>`.

| Task                  | Purpose                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `task build`          | Build the app and check for type errors (use this after making changes)   |
| `task types`          | Regenerate Wrangler/Cloudflare Worker types (`worker-configuration.d.ts`) |
| `task dev`            | Start the dev server (see below)                                          |
| `task preview`        | Preview the production build locally                                      |
| `task deploy:dev`     | Build and deploy to Cloudflare (development env)                          |
| `task deploy:prod`    | Build and deploy to production                                            |
| `task reindex:images` | Run the image reindex script (pass flags after `--`)                      |

Database migration tasks (`db:migrate`, `db:migrate:force`, `db:prod:migrate`, etc.) use 1Password and are for human use; agents should not run them.

## Do not run the dev server

**In general Agents must not start or keep a dev server running.**
You never need to start a dev server when interacting with a human. The human will have a dev server running, and if they do not, you can remind them to start one. When building a pull request without the help of a human, it can be helpful to run a dev server in certain circumstances. A dev server for tanstack start will automatically rebuild the generated routeTree.gen.ts file. You may need to run a dev server temporarily to rebuild this file.

## After making changes

1. **Always** run `task build` when you are done with a task. This builds the project and surfaces type errors.
2. **If you changed `wrangler.jsonc`**, also run `task types` after your changes. This updates `worker-configuration.d.ts` so Worker bindings and env types stay in sync.

## Project structure

- **Server**: `src/server.ts` (Worker entry), `src/router.tsx` (app router)
- **Routes**: `src/routes/` (file-based routing)
- **Database**: Postgresql, hosted on PlanetScale
- **Database Schema**: database.sql file, changes are applied by the human with pgschema
- **Embedding Models**: src/server/models/
- **Rerankers**: src/server/rerankers/

## Tech stack (reference)

- **Framework**: TanStack Start (React) with Vite
- **Deploy**: Cloudflare Workers (Wrangler)
- **Styling**: Tailwind CSS v4
- **Entry**: `src/server.ts` (Worker entry), `src/router.tsx` (app router)
- **Server logic**: `src/server/` (DB, auth, image search, etc.)
- **Routes**: `src/routes/` (file-based routing)
- **Database**: Postgresql, hosted on PlanetScale
- **Database Schema**: database.sql file, changes are applied by the human with pgschema
