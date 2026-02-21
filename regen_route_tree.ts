import { existsSync } from "node:fs";
import path from "node:path";

import { Generator, getConfig } from "@tanstack/router-generator";

function toImportPath(fromFile: string, absolutePath: string): string {
  let relativePath = path.relative(path.dirname(fromFile), absolutePath);

  if (!relativePath.startsWith(".")) {
    relativePath = `./${relativePath}`;
  }

  // ESM import paths must use POSIX separators.
  return relativePath.split(path.sep).join("/");
}

function findFirstExistingFile(root: string, candidates: Array<string>): string | null {
  for (const candidate of candidates) {
    const absolutePath = path.resolve(root, candidate);
    if (existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  return null;
}

async function main() {
  const root = process.cwd();
  const baseConfig = getConfig({}, root);
  const generatedRouteTreePath = path.resolve(baseConfig.generatedRouteTree);

  const routerFilePath = findFirstExistingFile(root, [
    "src/router.tsx",
    "src/router.ts",
    "src/router.jsx",
    "src/router.js",
  ]);

  if (!routerFilePath) {
    throw new Error(
      "Could not locate the router file. Expected one of: src/router.tsx, src/router.ts, src/router.jsx, src/router.js",
    );
  }

  const startFilePath = findFirstExistingFile(root, [
    "src/start.tsx",
    "src/start.ts",
    "src/start.jsx",
    "src/start.js",
  ]);

  const moduleDeclarationLines = [
    `import type { getRouter } from '${toImportPath(generatedRouteTreePath, routerFilePath)}'`,
    startFilePath
      ? `import type { startInstance } from '${toImportPath(generatedRouteTreePath, startFilePath)}'`
      : "import type { createStart } from '@tanstack/react-start'",
    "declare module '@tanstack/react-start' {",
    "  interface Register {",
    "    ssr: true",
    "    router: Awaited<ReturnType<typeof getRouter>>",
    ...(startFilePath
      ? ["    config: Awaited<ReturnType<typeof startInstance.getOptions>>"]
      : []),
    "  }",
    "}",
  ];

  const routeTreeFileFooter = [moduleDeclarationLines.join("\n")];

  const config = getConfig({ routeTreeFileFooter }, root);
  const generator = new Generator({ config, root });
  await generator.run();
}

await main();
