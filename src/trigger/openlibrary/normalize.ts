import { schemaTask, tasks } from "@trigger.dev/sdk/v3";
import { ResourceMonitor } from "@/trigger/resourceMonitor";
import { env } from "@/env";
import { z } from "zod/v4";
import { S3Client } from "@/trigger/openlibrary/s3";
import {
  clearDirectory,
  getFileNames,
  setupDuckDB,
  getParquetRowCount,
} from "@/trigger/openlibrary/utils";
import { csvToParquetMetadataSchema } from "@/trigger/openlibrary/csv-to-parquet";

export const aggregateEditionsMetadataValidator = z.object({
  status: z.enum(["success", "in-progress", "failed"]),
  rows: z.number().int(),
  dumpDate: z.string(),
  normalizedAt: z.iso.datetime(),
});

tasks.middleware("resource-monitor", async ({ ctx, next }) => {
  const resourceMonitor = new ResourceMonitor({ ctx });
  if (process.env.RESOURCE_MONITOR_ENABLED === "1") {
    resourceMonitor.startMonitoring(10_000);
  }
  await next();
  resourceMonitor.stopMonitoring();
});

const queries = {
  works: (bucket: string, source: string, target: string) => `
    COPY (
      SELECT
        replace(json_extract_string(data, '$.key'), '/works/', '') AS olid,
        TRY_CAST(revision AS BIGINT) AS revision,
        TRY_CAST(last_modified AS TIMESTAMP) AS last_modified,

        json_extract_string(data, '$.title') AS title,
        json_extract_string(data, '$.subtitle') AS subtitle,

        coalesce(
          list_transform(
            TRY_CAST(json_extract(data, '$.authors[*].author.key') AS VARCHAR[]),
            x -> replace(x, '/authors/', '')
          ),
          []::VARCHAR[]
        ) AS author_ids,

        json_extract(data, '$.authors')::JSON AS authors_json,
        json_extract(data, '$.translated_titles')::JSON AS translated_titles_json,

        coalesce(json_extract(data, '$.subjects')::VARCHAR[], []::VARCHAR[]) AS subjects,
        coalesce(json_extract(data, '$.subject_places')::VARCHAR[], []::VARCHAR[]) AS subject_places,
        coalesce(json_extract(data, '$.subject_times')::VARCHAR[], []::VARCHAR[]) AS subject_times,
        coalesce(json_extract(data, '$.subject_people')::VARCHAR[], []::VARCHAR[]) AS subject_people,

        CASE json_type(data, '$.description')
          WHEN 'VARCHAR' THEN json_extract_string(data, '$.description')
          WHEN 'OBJECT' THEN json_extract_string(data, '$.description.value')
        END AS description,

        coalesce(json_extract(data, '$.dewey_number')::VARCHAR[], []::VARCHAR[]) AS dewey_number,
        coalesce(json_extract(data, '$.lc_classifications')::VARCHAR[], []::VARCHAR[]) AS lc_classifications,

        CASE json_type(data, '$.first_sentence')
          WHEN 'VARCHAR' THEN json_extract_string(data, '$.first_sentence')
          WHEN 'OBJECT' THEN json_extract_string(data, '$.first_sentence.value')
        END AS first_sentence,

        coalesce(
          list_transform(
            TRY_CAST(json_extract(data, '$.original_languages[*].key') AS VARCHAR[]),
            x -> replace(x, '/languages/', '')
          ),
          []::VARCHAR[]
        ) AS original_language_ids,

        json_extract(data, '$.original_languages')::JSON AS original_languages_json,

        coalesce(json_extract(data, '$.other_titles')::VARCHAR[], []::VARCHAR[]) AS other_titles,
        json_extract_string(data, '$.first_publish_date') AS first_publish_date,

        json_extract(data, '$.links')::JSON AS links_json,

        CASE json_type(data, '$.notes')
          WHEN 'VARCHAR' THEN json_extract_string(data, '$.notes')
          WHEN 'OBJECT' THEN json_extract_string(data, '$.notes.value')
        END AS notes,

        replace(json_extract_string(data, '$.cover_edition.key'), '/books/', '') AS cover_edition_id,
        coalesce(json_extract(data, '$.covers')::BIGINT[], []::BIGINT[]) AS covers
      FROM read_parquet('s3://${bucket}/${source}')
    )
    TO 's3://${bucket}/${target}'
    (FORMAT PARQUET, COMPRESSION ZSTD);
  `,
  editions: (bucket: string, source: string, target: string) => `
    COPY (
      SELECT
        replace(json_extract_string(data, '$.key'), '/books/', '') AS olid,
        TRY_CAST(revision AS BIGINT) AS revision,
        TRY_CAST(last_modified AS TIMESTAMP) AS last_modified,

        json_extract_string(data, '$.title') AS title,
        json_extract_string(data, '$.title_prefix') AS title_prefix,
        json_extract_string(data, '$.subtitle') AS subtitle,
        coalesce(json_extract(data, '$.other_titles')::VARCHAR[], []::VARCHAR[]) AS other_titles,

        coalesce(
          list_transform(
            TRY_CAST(json_extract(data, '$.authors[*].key') AS VARCHAR[]),
            x -> replace(x, '/authors/', '')
          ),
          []::VARCHAR[]
        ) AS author_ids,
        json_extract(data, '$.authors')::JSON AS authors_json,

        json_extract_string(data, '$.by_statement') AS by_statement,
        json_extract_string(data, '$.publish_date') AS publish_date,
        json_extract_string(data, '$.copyright_date') AS copyright_date,
        json_extract_string(data, '$.edition_name') AS edition_name,

        coalesce(
          list_transform(
            TRY_CAST(json_extract(data, '$.languages[*].key') AS VARCHAR[]),
            x -> replace(x, '/languages/', '')
          ),
          []::VARCHAR[]
        ) AS language_ids,
        json_extract(data, '$.languages')::JSON AS languages_json,

        CASE json_type(data, '$.description')
          WHEN 'VARCHAR' THEN json_extract_string(data, '$.description')
          WHEN 'OBJECT' THEN json_extract_string(data, '$.description.value')
        END AS description,

        CASE json_type(data, '$.notes')
          WHEN 'VARCHAR' THEN json_extract_string(data, '$.notes')
          WHEN 'OBJECT' THEN json_extract_string(data, '$.notes.value')
        END AS notes,

        coalesce(json_extract(data, '$.genres')::VARCHAR[], []::VARCHAR[]) AS genres,
        json_extract(data, '$.table_of_contents')::JSON AS table_of_contents_json,
        coalesce(json_extract(data, '$.work_titles')::VARCHAR[], []::VARCHAR[]) AS work_titles,
        coalesce(json_extract(data, '$.series')::VARCHAR[], []::VARCHAR[]) AS series,

        json_extract_string(data, '$.physical_dimensions') AS physical_dimensions,
        json_extract_string(data, '$.physical_format') AS physical_format,
        TRY_CAST(json_extract(data, '$.number_of_pages') AS INTEGER) AS number_of_pages,
        coalesce(json_extract(data, '$.subjects')::VARCHAR[], []::VARCHAR[]) AS subjects,
        json_extract_string(data, '$.pagination') AS pagination,

        coalesce(json_extract(data, '$.lccn')::VARCHAR[], []::VARCHAR[]) AS lccn,
        json_extract_string(data, '$.ocaid') AS ocaid,
        coalesce(json_extract(data, '$.oclc_numbers')::VARCHAR[], []::VARCHAR[]) AS oclc_numbers,
        coalesce(json_extract(data, '$.isbn_10')::VARCHAR[], []::VARCHAR[]) AS isbn_10,
        coalesce(json_extract(data, '$.isbn_13')::VARCHAR[], []::VARCHAR[]) AS isbn_13,
        coalesce(json_extract(data, '$.dewey_decimal_class')::VARCHAR[], []::VARCHAR[]) AS dewey_decimal_class,
        coalesce(json_extract(data, '$.lc_classifications')::VARCHAR[], []::VARCHAR[]) AS lc_classifications,
        coalesce(json_extract(data, '$.contributions')::VARCHAR[], []::VARCHAR[]) AS contributions,
        coalesce(json_extract(data, '$.publish_places')::VARCHAR[], []::VARCHAR[]) AS publish_places,
        json_extract_string(data, '$.publish_country') AS publish_country,
        coalesce(json_extract(data, '$.publishers')::VARCHAR[], []::VARCHAR[]) AS publishers,
        coalesce(json_extract(data, '$.distributors')::VARCHAR[], []::VARCHAR[]) AS distributors,

        CASE json_type(data, '$.first_sentence')
          WHEN 'VARCHAR' THEN json_extract_string(data, '$.first_sentence')
          WHEN 'OBJECT' THEN json_extract_string(data, '$.first_sentence.value')
        END AS first_sentence,

        json_extract_string(data, '$.weight') AS weight,
        coalesce(json_extract(data, '$.location')::VARCHAR[], []::VARCHAR[]) AS locations,
        TRY_CAST(json_extract(data, '$.scan_on_demand') AS BOOLEAN) AS scan_on_demand,

        coalesce(
          list_transform(
            TRY_CAST(json_extract(data, '$.collections[*].key') AS VARCHAR[]),
            x -> replace(x, '/collections/', '')
          ),
          []::VARCHAR[]
        ) AS collection_ids,
        json_extract(data, '$.collections')::JSON AS collections_json,

        coalesce(json_extract(data, '$.uris')::VARCHAR[], []::VARCHAR[]) AS uris,
        coalesce(json_extract(data, '$.uri_descriptions')::VARCHAR[], []::VARCHAR[]) AS uri_descriptions,
        json_extract_string(data, '$.translation_of') AS translation_of,

        coalesce(
          list_transform(
            TRY_CAST(json_extract(data, '$.works[*].key') AS VARCHAR[]),
            x -> replace(x, '/works/', '')
          ),
          []::VARCHAR[]
        ) AS work_ids,
        json_extract(data, '$.works')::JSON AS works_json,

        coalesce(json_extract(data, '$.source_records')::VARCHAR[], []::VARCHAR[]) AS source_records,

        coalesce(
          list_transform(
            TRY_CAST(json_extract(data, '$.translated_from[*].key') AS VARCHAR[]),
            x -> replace(x, '/languages/', '')
          ),
          []::VARCHAR[]
        ) AS translated_from_language_ids,
        json_extract(data, '$.translated_from')::JSON AS translated_from_json,

        coalesce(
          list_transform(
            TRY_CAST(json_extract(data, '$.scan_records[*].key') AS VARCHAR[]),
            x -> replace(x, '/scan_records/', '')
          ),
          []::VARCHAR[]
        ) AS scan_record_ids,
        json_extract(data, '$.scan_records')::JSON AS scan_records_json,

        coalesce(
          list_transform(
            TRY_CAST(json_extract(data, '$.volumes[*].key') AS VARCHAR[]),
            x -> replace(x, '/volumes/', '')
          ),
          []::VARCHAR[]
        ) AS volume_ids,
        json_extract(data, '$.volumes')::JSON AS volumes_json,

        json_extract_string(data, '$.accompanying_material') AS accompanying_material
      FROM read_parquet('s3://${bucket}/${source}')
    )
    TO 's3://${bucket}/${target}'
    (FORMAT PARQUET, COMPRESSION ZSTD);
  `,
  authors: (bucket: string, source: string, target: string) => `
    COPY (
      SELECT
        replace(json_extract_string(data, '$.key'), '/authors/', '') AS olid,
        TRY_CAST(revision AS BIGINT) AS revision,
        TRY_CAST(last_modified AS TIMESTAMP) AS last_modified,

        json_extract_string(data, '$.name') AS name,
        TRY_CAST(json_extract(data, '$.eastern_order') AS BOOLEAN) AS eastern_order,
        json_extract_string(data, '$.personal_name') AS personal_name,
        json_extract_string(data, '$.enumeration') AS enumeration,
        json_extract_string(data, '$.title') AS title,

        coalesce(json_extract(data, '$.alternate_names')::VARCHAR[], []::VARCHAR[]) AS alternate_names,
        coalesce(json_extract(data, '$.uris')::VARCHAR[], []::VARCHAR[]) AS uris,

        CASE json_type(data, '$.bio')
          WHEN 'VARCHAR' THEN json_extract_string(data, '$.bio')
          WHEN 'OBJECT' THEN json_extract_string(data, '$.bio.value')
        END AS bio,

        json_extract_string(data, '$.location') AS location,
        json_extract_string(data, '$.birth_date') AS birth_date,
        json_extract_string(data, '$.death_date') AS death_date,
        json_extract_string(data, '$.date') AS date,
        json_extract_string(data, '$.wikipedia') AS wikipedia,

        json_extract(data, '$.links')::JSON AS links_json
      FROM read_parquet('s3://${bucket}/${source}')
    )
    TO 's3://${bucket}/${target}'
    (FORMAT PARQUET, COMPRESSION ZSTD);
  `,
};

export const openLibraryNormalizeTask = schemaTask({
  id: "openlibrary-normalize",
  machine: "micro",
  retry: {
    maxAttempts: 1,
  },
  schema: z.object({
    source: z.string(),
    target: z.string(),
    dumpDate: z.string(),
    queryToUse: z.enum(["works", "editions", "authors"]),
  }),
  run: async ({ source, target, dumpDate, queryToUse }, { ctx }) => {
    const s3 = new S3Client();
    if (!(await checkIfShouldRun(source, target, s3, ctx))) {
      return;
    }

    clearDirectory("/tmp");
    const [sourceParquetKey, sourceMetadataKey] = getFileNames(source);
    const [targetParquetKey, targetMetadataKey] = getFileNames(target);
    await s3.safeDeleteObject([targetParquetKey, targetMetadataKey]);
    await s3.setMetadata(
      targetMetadataKey,
      aggregateEditionsMetadataValidator,
      {
        status: "in-progress",
        rows: 0,
        dumpDate,
        normalizedAt: new Date().toISOString(),
      },
    );
    await using db = await setupDuckDB(ctx);
    try {
      console.log(`Copying from ${sourceParquetKey} to ${targetParquetKey}`);
      const query = queries[queryToUse](
        env.S3_BUCKET,
        sourceParquetKey,
        targetParquetKey,
      );
      await db.run(query);
      const rows = await getParquetRowCount(targetParquetKey, db);
      await s3.setMetadata(
        targetMetadataKey,
        aggregateEditionsMetadataValidator,
        {
          status: "success",
          rows,
          dumpDate,
          normalizedAt: new Date().toISOString(),
        },
      );
      console.log(`Normalized ${rows} rows from ${source} to ${target}`);
    } catch (e) {
      await s3.setMetadata(
        targetMetadataKey,
        aggregateEditionsMetadataValidator,
        {
          rows: 0,
          dumpDate,
          normalizedAt: new Date().toISOString(),
          status: "failed",
        },
      );
      console.log(`Failed to normalize ${source} to ${target}: ${e}`);
      throw e;
    }
  },
});

async function checkIfShouldRun(
  source: string,
  target: string,
  s3: S3Client,
  ctx: Parameters<typeof setupDuckDB>[0],
) {
  // Checks if initial conditions allow this workflow step to run
  // Source should be marked as complete, and count of rows should match metadata
  //   Any incorrect value for source will throw an error
  // Target should be the following:
  // - not present (first run, returns true)
  // - present and count of rows matches metadata (up-to-date, returns false)
  // - count does not match metadata (out-of-date, returns true)
  // - dumpDate of target does not match dumpDate of source (out-of-date, returns true)
  const [sourceParquetKey, sourceMetadataKey] = getFileNames(source);
  const sourceMetadata = await s3.getMetadata(
    sourceMetadataKey,
    csvToParquetMetadataSchema,
  );
  if (!sourceMetadata.success) {
    throw new Error(
      `Source ${sourceMetadataKey} file parse error, or file not found`,
    );
  }
  if (sourceMetadata.data.status !== "success") {
    throw new Error(
      `Source metadata is not complete: ${sourceMetadata.data.status}`,
    );
  }
  const sourceRowCount = await getParquetRowCount(sourceParquetKey, undefined, ctx);
  if (sourceRowCount !== sourceMetadata.data.rows) {
    throw new Error(
      `Source row count ${sourceRowCount} does not match metadata row count ${sourceMetadata.data.rows}`,
    );
  }

  // Source parquet and metadata check out

  const [targetParquetKey, targetMetadataKey] = getFileNames(target);
  const targetMetadata = await s3.getMetadata(
    targetMetadataKey,
    aggregateEditionsMetadataValidator,
  );
  if (!targetMetadata.success) {
    console.log(
      `Target ${targetMetadataKey} file not found or parse error, running step`,
    );
    return true;
  }
  if (targetMetadata.data.status !== "success") {
    console.log(
      `Target metadata is not complete: ${targetMetadata.data.status}, running step`,
    );
    return true;
  }
  if (targetMetadata.data.dumpDate !== sourceMetadata.data.dumpDate) {
    console.log(
      `Target dumpDate ${targetMetadata.data.dumpDate} does not match source dumpDate ${sourceMetadata.data.dumpDate}, running step`,
    );
    return true;
  }
  if (targetMetadata.data.normalizedAt <= sourceMetadata.data.exportedAt) {
    console.log(
      `Target normalizedAt ${targetMetadata.data.normalizedAt} is before source exportedAt ${sourceMetadata.data.exportedAt}, running step`,
    );
    return true;
  }
  const targetRowCount = await getParquetRowCount(targetParquetKey, undefined, ctx);
  if (targetRowCount !== targetMetadata.data.rows) {
    console.log(
      `Target row count ${targetRowCount} does not match metadata row count ${targetMetadata.data.rows}, running step`,
    );
    return true;
  }

  console.log(
    `Target file and metadata appear to be up to date. Skipping step.`,
  );
  return false;
}
