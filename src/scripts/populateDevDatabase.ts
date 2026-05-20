import { createPostgresWriteDb } from "../db";

const { sql } = createPostgresWriteDb();

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

    await tx`
      INSERT INTO dev.openlibrary_work
      SELECT *
      FROM prod.openlibrary_work TABLESAMPLE SYSTEM (1)
    `;

    await tx`
      INSERT INTO dev.openlibrary_work
      SELECT work.*
      FROM prod.openlibrary_work work
      WHERE EXISTS (
        SELECT 1
        FROM dev.image image
        WHERE image.openlibrary_work_id = work.olid
      )
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

  console.log("Populated dev schema from prod schema.");
} finally {
  await sql.end();
}
