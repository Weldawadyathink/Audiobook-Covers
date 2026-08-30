import { createPostgresWriteDb } from "../db.node";

const { sql } = createPostgresWriteDb();

/**
 * Percentage of `prod.openlibrary_work` to carry over beyond the rows an image
 * actually references. The whole catalogue is tens of millions of rows, which
 * dev has no reason to hold; the sample only exists so that catalogue search
 * has something to miss against.
 */
const samplePercent = Number(process.env.OPENLIBRARY_SAMPLE_PERCENT ?? "1");

if (
  !Number.isFinite(samplePercent) ||
  samplePercent < 0 ||
  samplePercent > 100
) {
  throw new Error(
    `OPENLIBRARY_SAMPLE_PERCENT must be between 0 and 100, got ${process.env.OPENLIBRARY_SAMPLE_PERCENT}`,
  );
}

try {
  await sql.begin(async (tx) => {
    await tx`
      TRUNCATE TABLE
        dev.session,
        dev.web_user,
        dev.image,
        dev.reddit_comment,
        dev.reddit_post,
        dev.openlibrary_work
      RESTART IDENTITY CASCADE
    `;

    await tx`INSERT INTO dev.reddit_post SELECT * FROM prod.reddit_post`;
    await tx`INSERT INTO dev.reddit_comment SELECT * FROM prod.reddit_comment`;
    await tx`INSERT INTO dev.web_user SELECT * FROM prod.web_user`;
    await tx`INSERT INTO dev.session SELECT * FROM prod.session`;
    await tx`INSERT INTO dev.image SELECT * FROM prod.image`;

    // Referenced rows first, so they are never lost to a conflict with the
    // random sample.
    await tx`
      INSERT INTO dev.openlibrary_work
      SELECT work.*
      FROM prod.openlibrary_work work
      WHERE EXISTS (
        SELECT 1
        FROM dev.image image
        WHERE image.openlibrary_work_id = work.olid
      )
    `;

    await tx`
      INSERT INTO dev.openlibrary_work
      SELECT *
      FROM prod.openlibrary_work TABLESAMPLE SYSTEM (${samplePercent}::real)
      ON CONFLICT (olid) DO NOTHING
    `;

    await tx`
      SELECT setval(
        'dev.web_user_id_seq'::regclass,
        COALESCE((SELECT MAX(id) FROM dev.web_user), 1),
        (SELECT COUNT(*) > 0 FROM dev.web_user)
      )
    `;
  });

  const [counts] = await sql`
    SELECT
      (SELECT COUNT(*) FROM dev.reddit_post) AS reddit_post,
      (SELECT COUNT(*) FROM dev.reddit_comment) AS reddit_comment,
      (SELECT COUNT(*) FROM dev.image) AS image,
      (SELECT COUNT(*) FROM dev.web_user) AS web_user,
      (SELECT COUNT(*) FROM dev.session) AS session,
      (SELECT COUNT(*) FROM dev.openlibrary_work) AS openlibrary_work
  `;

  console.log(
    `Populated dev schema from prod schema (openlibrary_work sampled at ${samplePercent}%).`,
  );
  console.table(counts);
} finally {
  await sql.end();
}
