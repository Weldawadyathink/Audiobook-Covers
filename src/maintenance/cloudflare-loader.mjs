const source = `
  export const env = { ...process.env };

  export function waitUntil(promise) {
    void promise;
  }
`.trim();

function decodeDataUrl(url) {
  const comma = url.indexOf(",");
  return decodeURIComponent(url.slice(comma + 1));
}

export async function load(url, context, nextLoad) {
  // Robust fallback: if anything reaches load() as cloudflare:workers, handle it
  if (url === "cloudflare:workers" || url.startsWith("cloudflare:")) {
    return {
      format: "module",
      source: STUB_SOURCE,
      shortCircuit: true,
    };
  }

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
  if (specifier === "cloudflare:workers") {
    const url = `data:text/javascript;charset=utf-8,${encodeURIComponent(
      source,
    )}`;

    return { url, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
