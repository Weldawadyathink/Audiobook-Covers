import * as https from "https";
import { Transform } from "node:stream";

// Follows the "latest" redirect to extract the dump date from the resolved URL.
// OpenLibrary redirects ol_dump_works_latest.txt.gz →
// ol_dump_works_YYYY-MM-DD.txt.gz, so the date is in the filename.
export async function resolveDumpDate(url: string): Promise<string> {
  let current = url;
  for (let hops = 0; hops < 5; hops++) {
    const { statusCode, headers } = await new Promise<{
      statusCode: number;
      headers: Record<string, string | string[]>;
    }>((resolve, reject) => {
      const req = https.request(current, { method: "HEAD" }, (res) => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | string[]>,
        });
      });
      req.on("error", reject);
      req.end();
    });
    if (
      statusCode === 301 ||
      statusCode === 302 ||
      statusCode === 307 ||
      statusCode === 308
    ) {
      const loc = headers["location"];
      if (!loc) throw new Error("Redirect with no Location header");
      current = Array.isArray(loc) ? loc[0] : loc;
      continue;
    }
    const match = current.match(/(\d{4}-\d{2}-\d{2})\.txt\.gz/);
    if (!match)
      throw new Error(`Could not extract dump date from URL: ${current}`);
    return match[1];
  }
  throw new Error("Too many redirects resolving dump URL");
}

export function streamTracker(
  runEvery: number,
  callback: (
    rowCount: number,
    time: number,
    rowsSinceLastCall: number,
  ) => unknown,
) {
  let rowCount = 0;
  let lastReported = 0;
  let lastTime: number | undefined;
  return new Transform({
    objectMode: true,
    transform(chunk, _, done) {
      if (lastTime === undefined) {
        lastTime = performance.now();
      }
      rowCount++;
      if (rowCount % runEvery === 0) {
        const now = performance.now();
        const rowsSinceLastCall = rowCount - lastReported;
        callback(rowCount, now - lastTime, rowsSinceLastCall);
        lastReported = rowCount;
        lastTime = now;
      }
      return done(null, chunk);
    },
    flush(done) {
      if (lastTime !== undefined && rowCount !== lastReported) {
        callback(
          rowCount,
          performance.now() - lastTime,
          rowCount - lastReported,
        );
      }
      done();
    },
  });
}
