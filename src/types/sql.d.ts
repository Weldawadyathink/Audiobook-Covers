/**
 * `.sql` files are imported as raw text.
 *
 * - Vite (app build) understands `?raw` natively.
 * - The Trigger.dev bundler (esbuild) is taught the same suffix by the
 *   `sqlRawPlugin` esbuild plugin registered in `trigger.config.ts`.
 */
declare module "*.sql?raw" {
  const contents: string;
  export default contents;
}
