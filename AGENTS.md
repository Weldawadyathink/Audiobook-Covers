# Agent instructions for Audiobook Covers

Guidance for AI agents working in this repo.

## Package management

All packages are managed using pnpm.

## Commands

**All commands are run through the Justfile.** Do not run `pnpm` scripts or `package.json` scripts directly. Use `just <recipe>`.

| Recipe                | Purpose                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `just build`          | Build the app and check for type errors (use this after making changes)   |
| `just types`          | Regenerate Wrangler/Cloudflare Worker types (`worker-configuration.d.ts`) |
| `just regen-route-tree` | Regenerate TanStack route tree (`src/routeTree.gen.ts`) once           |
| `just dev`            | Start the dev server (see below)                                          |
| `just preview`        | Preview the production build locally                                      |
| `just deploy`         | Build and deploy to Cloudflare (development env)                          |
| `just deploy-prod`    | Build and deploy to production                                            |
| `just reindex-images` | Run the image reindex script                                              |

Database migration recipes (`db_migrate`, `db_migrate_force`, `prod_db_migrate`, etc.) use 1Password and are for human use; agents should not run them.

## Do not run the dev server

**In general Agents must not start or keep a dev server running.**
You never need to start a dev server when interacting with a human. The human will have a dev server running, and if they do not, you can remind them to start one. If you need to regenerate the TanStack route tree, run `just regen-route-tree` instead of starting a dev server.

## After making changes

1. **Always** run `just build` when you are done with a task. This builds the project and surfaces type errors.
2. **If you changed `wrangler.jsonc`**, also run `just types` after your changes. This updates `worker-configuration.d.ts` so Worker bindings and env types stay in sync.

## Tech stack (reference)

- **Framework**: TanStack Start (React) with Vite
- **Deploy**: Cloudflare Workers (Wrangler)
- **Styling**: Tailwind CSS v4
- **Entry**: `src/server.ts` (Worker entry), `src/router.tsx` (app router)
- **Server logic**: `src/server/` (DB, auth, image search, etc.)
- **Routes**: `src/routes/` (file-based routing)
