/**
 * Perceptual-hash duplicate detection for the image catalogue.
 *
 * Three subcommands, meant to be run in order and by hand:
 *
 *   hash    Download every original that has no hash yet and fill in
 *           `phash64`, `width`, `height` and `bytes`. Resumable — re-running it
 *           only picks up rows still missing a hash.
 *   report  Ask Postgres for every pair within the Hamming threshold, group the
 *           pairs into clusters, and print what `apply` would do. Read-only.
 *   apply   Write the result of `report`: point each loser at its winner via
 *           `duplicate_of` and drop it out of search.
 *
 * The threshold defaults to 4 and can be overridden with `--threshold=N`. See
 * the comment on `image.phash64` in the schema for why 4, and why 64 bits.
 */
import { createPostgresWriteDb } from "../db.node";
import { schemaName } from "../db/schema";
import { logger } from "../logger";
import { decodeImage, downscaleToSquare } from "./imagePixels";
import { DCT_SIZE, perceptualHash } from "./perceptualHash";

const IMAGE_URL_PREFIX = "https://images.audiobookcovers.com";

const DOWNLOAD_CONCURRENCY = 16;
const UPDATE_BATCH_SIZE = 100;

const { sql } = createPostgresWriteDb({ application_name: "dedupe-images" });

interface PendingImage {
  id: string;
  extension: string;
}

interface HashedImage {
  id: string;
  phash64: string;
  width: number;
  height: number;
  bytes: number;
}

async function hashOne(image: PendingImage): Promise<HashedImage> {
  const url = `${IMAGE_URL_PREFIX}/original/${image.id}.${image.extension}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  const decoded = decodeImage(buffer);
  return {
    id: image.id,
    phash64: perceptualHash(downscaleToSquare(decoded, DCT_SIZE)),
    width: decoded.width,
    height: decoded.height,
    bytes: buffer.byteLength,
  };
}

async function writeHashes(hashed: HashedImage[]) {
  if (hashed.length === 0) return;
  await sql`
    UPDATE ${sql(schemaName)}.image AS image
    SET phash64 = source.phash64::bit(64),
        width = source.width::int,
        height = source.height::int,
        bytes = source.bytes::int
    FROM (VALUES ${sql(
      hashed.map((row) => [
        row.id,
        row.phash64,
        row.width,
        row.height,
        row.bytes,
      ]),
    )}) AS source(id, phash64, width, height, bytes)
    WHERE image.id = source.id::uuid
  `;
}

async function commandHash() {
  const pending = (await sql`
    SELECT id, extension
    FROM ${sql(schemaName)}.image
    WHERE phash64 IS NULL
      AND extension IS NOT NULL
      AND NOT deleted
    ORDER BY id
  `) as unknown as PendingImage[];

  logger.info(`Hashing ${pending.length} images in ${schemaName}.image`);
  if (pending.length === 0) return;

  let done = 0;
  let failed = 0;
  let batch: HashedImage[] = [];

  // A hand-rolled worker pool rather than chunked Promise.all, so one slow
  // download cannot stall the other fifteen slots behind it. Only the downloads
  // actually overlap — decoding is synchronous and holds the event loop, at
  // roughly 200ms for a 2400x2400 JPEG, so expect the whole backfill to take
  // around half an hour and to be bounded by CPU rather than network.
  let next = 0;
  const workers = Array.from(
    { length: Math.min(DOWNLOAD_CONCURRENCY, pending.length) },
    async () => {
      for (;;) {
        const index = next++;
        if (index >= pending.length) return;
        const image = pending[index]!;
        try {
          batch.push(await hashOne(image));
        } catch (error) {
          failed++;
          logger.warn(`Skipping ${image.id}: ${String(error)}`);
        }
        done++;

        if (batch.length >= UPDATE_BATCH_SIZE) {
          const toWrite = batch;
          batch = [];
          await writeHashes(toWrite);
        }
        if (done % 500 === 0) {
          logger.info(`  ${done}/${pending.length} (${failed} failed)`);
        }
      }
    },
  );

  await Promise.all(workers);
  await writeHashes(batch);
  logger.info(`Hashed ${done - failed} images, ${failed} failed`);
}

interface Pair {
  a: string;
  b: string;
  distance: number;
}

interface Candidate {
  id: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  extension: string | null;
  searchable: boolean | null;
}

interface Cluster {
  winner: Candidate;
  losers: Candidate[];
  maxDistance: number;
}

/**
 * Every pair of live images within `threshold` bits of each other.
 *
 * The comparison is a sequential self-join by design — a Hamming predicate is
 * not indexable, and at this table size the full ~29M `bit_count` evaluations
 * take about ten seconds, which is cheaper than maintaining any structure that
 * would avoid them.
 */
async function findPairs(threshold: number): Promise<Pair[]> {
  return (await sql`
    SELECT a.id AS a, b.id AS b, bit_count(a.phash64 # b.phash64) AS distance
    FROM ${sql(schemaName)}.image a
    JOIN ${sql(schemaName)}.image b
      ON b.id > a.id
     AND bit_count(a.phash64 # b.phash64) <= ${threshold}
    WHERE a.phash64 IS NOT NULL AND NOT a.deleted AND a.duplicate_of IS NULL
      AND b.phash64 IS NOT NULL AND NOT b.deleted AND b.duplicate_of IS NULL
    ORDER BY distance, a.id, b.id
  `) as unknown as Pair[];
}

/**
 * Group pairs into clusters and pick which image each cluster keeps.
 *
 * Grouping is transitive: if A matches B and B matches C, all three end up in
 * one cluster even when A and C are further apart than the threshold. That is
 * the right call at a distance of 4, where the measured gap to unrelated images
 * is 12, but it is also the part that would go wrong first if the threshold
 * were raised — which is why `report` prints the widest distance per cluster.
 */
function buildClusters(pairs: Pair[], candidates: Map<string, Candidate>) {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const seen: string[] = [];
    let current = id;
    while (
      parent.get(current) !== undefined &&
      parent.get(current) !== current
    ) {
      seen.push(current);
      current = parent.get(current)!;
    }
    for (const node of seen) parent.set(node, current);
    return current;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  for (const pair of pairs) {
    if (!parent.has(pair.a)) parent.set(pair.a, pair.a);
    if (!parent.has(pair.b)) parent.set(pair.b, pair.b);
    union(pair.a, pair.b);
  }

  const members = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const list = members.get(root);
    if (list) list.push(id);
    else members.set(root, [id]);
  }

  const widest = new Map<string, number>();
  for (const pair of pairs) {
    const root = find(pair.a);
    widest.set(root, Math.max(widest.get(root) ?? 0, pair.distance));
  }

  const clusters: Cluster[] = [];
  for (const [root, ids] of members) {
    const rows = ids
      .map((id) => candidates.get(id))
      .filter((row): row is Candidate => row !== undefined)
      // Most pixels wins. Ties break on file size, which separates a genuine
      // original from a re-encode of it, and finally on id so that repeated
      // runs always choose the same row.
      .sort((a, b) => {
        const areaA = (a.width ?? 0) * (a.height ?? 0);
        const areaB = (b.width ?? 0) * (b.height ?? 0);
        if (areaA !== areaB) return areaB - areaA;
        if ((a.bytes ?? 0) !== (b.bytes ?? 0))
          return (b.bytes ?? 0) - (a.bytes ?? 0);
        return a.id < b.id ? -1 : 1;
      });

    const [winner, ...losers] = rows;
    if (!winner || losers.length === 0) continue;
    clusters.push({ winner, losers, maxDistance: widest.get(root) ?? 0 });
  }

  return clusters.sort((a, b) => b.losers.length - a.losers.length);
}

async function loadClusters(threshold: number) {
  const pairs = await findPairs(threshold);
  logger.info(`Found ${pairs.length} pairs within ${threshold} bits`);
  if (pairs.length === 0) return [];

  const ids = [...new Set(pairs.flatMap((pair) => [pair.a, pair.b]))];
  const rows = (await sql`
    SELECT id, width, height, bytes, extension, searchable
    FROM ${sql(schemaName)}.image
    WHERE id = ANY(${ids}::uuid[])
  `) as unknown as Candidate[];

  return buildClusters(pairs, new Map(rows.map((row) => [row.id, row])));
}

function describe(row: Candidate) {
  const size = row.width && row.height ? `${row.width}x${row.height}` : "?x?";
  const bytes = row.bytes ? `${Math.round(row.bytes / 1024)}KB` : "?KB";
  return `${row.id}  ${size.padEnd(11)} ${bytes.padStart(8)}  ${row.extension ?? "?"}`;
}

async function commandReport(threshold: number) {
  const clusters = await loadClusters(threshold);
  if (clusters.length === 0) {
    logger.info("No duplicates found");
    return;
  }

  const total = clusters.reduce((sum, group) => sum + group.losers.length, 0);
  for (const cluster of clusters) {
    console.log(
      `\ncluster of ${cluster.losers.length + 1} (max distance ${cluster.maxDistance})`,
    );
    console.log(`  keep  ${describe(cluster.winner)}`);
    for (const loser of cluster.losers) {
      console.log(`  drop  ${describe(loser)}`);
    }
  }
  console.log(
    `\n${clusters.length} clusters, ${total} images would be marked duplicate.`,
  );
  console.log("Re-run with `apply` to write this.");
}

async function commandApply(threshold: number) {
  const clusters = await loadClusters(threshold);
  if (clusters.length === 0) {
    logger.info("No duplicates found, nothing to apply");
    return;
  }

  const updates = clusters.flatMap((cluster) =>
    cluster.losers.map((loser) => [loser.id, cluster.winner.id]),
  );

  await sql.begin(async (tx) => {
    await tx`
      UPDATE ${tx(schemaName)}.image AS image
      SET duplicate_of = source.winner::uuid,
          searchable = false
      FROM (VALUES ${tx(updates)}) AS source(loser, winner)
      WHERE image.id = source.loser::uuid
    `;
  });

  logger.info(
    `Marked ${updates.length} images as duplicates across ${clusters.length} clusters`,
  );
}

const command = process.argv[2];
const thresholdArg = process.argv.find((arg) => arg.startsWith("--threshold="));
const threshold = thresholdArg ? Number(thresholdArg.split("=")[1]) : 4;

if (!Number.isInteger(threshold) || threshold < 0 || threshold > 64) {
  throw new Error(`--threshold must be an integer 0-64, got ${threshold}`);
}

try {
  switch (command) {
    case "hash":
      await commandHash();
      break;
    case "report":
      await commandReport(threshold);
      break;
    case "apply":
      await commandApply(threshold);
      break;
    default:
      throw new Error(
        `Usage: dedupeImages.ts <hash|report|apply> [--threshold=4]`,
      );
  }
} finally {
  await sql.end();
}
