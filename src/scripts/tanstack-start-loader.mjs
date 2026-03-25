import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
register(import.meta.url);

const source = readFileSync(
  fileURLToPath(new URL("./tanstack-start-stub.mjs", import.meta.url)),
  "utf8",
);

function decodeDataUrl(url) {
  const comma = url.indexOf(",");
  return decodeURIComponent(url.slice(comma + 1));
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("data:text/javascript")) {
    return {
      format: "module",
      source: decodeDataUrl(url),
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@tanstack/react-start") {
    const url = `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;

    return { url, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
