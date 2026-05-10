import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import prettyMilliseconds from "pretty-ms";
import formatNumber from "format-number";
import { BQClient } from "./bq";
import { getDbWriteConnection } from "@/db";
import { env } from "@/env";
import { streamTracker } from "./utils";

const format = formatNumber({ round: 0 });
const SHARD_COUNT = 16;

function csvValue(value: unknown) {
  if (value == null) return "";
  return `"${String(value).replaceAll('"', '""')}"`;
}

function scoreRowsAsCsv() {
  return new Transform({
    objectMode: true,
    transform(row, _encoding, callback) {
      callback(null, `${csvValue(row.olid)},${csvValue(row.canonical_score)}\n`);
    },
  });
}

export const openLibraryBackfillCanonicalScoreTask = schemaTask({
  id: "openlibrary-backfill-canonical-score",
  schema: z
    .object({
      startShard: z.number().int().min(1).max(SHARD_COUNT).default(1),
      endShard: z.number().int().min(1).max(SHARD_COUNT).default(SHARD_COUNT),
    })
    .refine((payload) => payload.startShard <= payload.endShard, {
      message: "startShard must be less than or equal to endShard",
      path: ["endShard"],
    }),
  machine: "micro",
  maxDuration: 12 * 60 * 60,
  retry: {
    maxAttempts: 1,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async ({ startShard, endShard }) => {
    console.log(
      `Backfilling OpenLibrary canonical scores for shards ${startShard}-${endShard}/${SHARD_COUNT}`,
    );
    const bq = new BQClient();
    const { sql } = getDbWriteConnection(env);

    try {
      const startedAt = performance.now();
      let exportedCount = 0;
      let updatedCount = 0;

      for (let shardNumber = startShard; shardNumber <= endShard; shardNumber++) {
        const shardIndex = shardNumber - 1;
        console.log(
          `Streaming canonical score shard ${shardNumber}/${SHARD_COUNT}`,
        );
        const scoreStream = bq.queryStream(`
          SELECT
            olid,
            canonical_score
          FROM \`${bq.projectId}.openlibrary.works_search\`
          WHERE canonical_score IS NOT NULL
            AND MOD(ABS(FARM_FINGERPRINT(olid)), ${SHARD_COUNT}) = ${shardIndex}
        `);

        const result = await sql.begin(async (tx) => {
          await tx.unsafe(`
            CREATE TEMP TABLE openlibrary_canonical_score_import_stage (
              olid TEXT NOT NULL,
              canonical_score INTEGER NOT NULL
            ) ON COMMIT DROP
          `);

          const copyStream = await tx
            .unsafe(
              `
            COPY openlibrary_canonical_score_import_stage (olid, canonical_score)
            FROM STDIN
            WITH (FORMAT csv)
          `,
            )
            .writable();

          await pipeline(
            scoreStream,
            scoreRowsAsCsv(),
            streamTracker(100_000, (n, t, rowsSinceLastCall) => {
              console.log(
                `Shard ${shardNumber}/${SHARD_COUNT}: completed ${format(n)} rows in ${prettyMilliseconds(t)} (${format((rowsSinceLastCall / t) * 1000)} rows/sec)`,
              );
            }),
            copyStream,
          );

          const [stageStats] = await tx.unsafe<[{ total: number }]>(`
            SELECT COUNT(*)::int AS total
            FROM openlibrary_canonical_score_import_stage
          `);

          console.log(
            `Updating canonical_score for ${format(stageStats.total)} rows in shard ${shardNumber}/${SHARD_COUNT}`,
          );
          const updateResult = await tx.unsafe(`
            UPDATE openlibrary_work work
            SET canonical_score = score_rows.canonical_score
            FROM openlibrary_canonical_score_import_stage score_rows
            WHERE work.olid = score_rows.olid
              AND work.canonical_score IS DISTINCT FROM score_rows.canonical_score
          `);

          return {
            exportedCount: stageStats.total,
            updatedCount: updateResult.count ?? 0,
          };
        });

        exportedCount += result.exportedCount;
        updatedCount += result.updatedCount;

        console.log(
          `Committed shard ${shardNumber}/${SHARD_COUNT}: ${format(
            result.updatedCount,
          )} rows updated from ${format(result.exportedCount)} exported rows`,
        );
      }

      console.log(
        `Backfilled canonical scores in ${prettyMilliseconds(
          performance.now() - startedAt,
        )}: ${format(updatedCount)} rows updated from ${format(
          exportedCount,
        )} exported rows`,
      );

      return { startShard, endShard, exportedCount, updatedCount };
    } finally {
      await sql.end();
    }
  },
});
