import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { createReadDb, createWriteDb } from "@/db.cloudflare";
import { cover_feedback, image, openlibrary_work, web_user } from "@/db/schema";
import { requireAdmin } from "@/server/session";
import { captureAnalyticsEvent } from "@/server/analyticsCore";
import { shapeImageDataArray, DBImageDataValidator } from "@/server/imageData";
import { parseOpenLibraryWorkId } from "@/server/openlibraryRef";

const verdictValidator = z.enum(["CORRECT", "INCORRECT"]);

/**
 * Public. Anyone looking at a cover can say whether the book is right.
 *
 * The current match is snapshotted onto the row so the report still means
 * something after the match changes.
 */
export const submitCoverFeedback = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      imageId: z.uuid(),
      verdict: verdictValidator,
      note: z.string().trim().max(300).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const writeDb = createWriteDb();

    const [target] = await writeDb
      .select({ workId: image.openlibrary_work_id })
      .from(image)
      .where(eq(image.id, data.imageId))
      .limit(1);

    if (!target) {
      throw new Error("That cover does not exist.");
    }

    await writeDb.insert(cover_feedback).values({
      image_id: data.imageId,
      openlibrary_work_id: target.workId,
      verdict: data.verdict,
      note: data.note?.length ? data.note : null,
    });

    await captureAnalyticsEvent({
      data: {
        eventType: "coverFeedbackSubmitted",
        payload: {
          imageId: data.imageId,
          verdict: data.verdict,
          hasNote: Boolean(data.note?.length),
        },
      },
    });

    return { success: true };
  });

export const listFeedback = createServerFn()
  .inputValidator(
    z.object({
      status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]).default("OPEN"),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const readDb = createReadDb();

    const rows = await readDb
      .select({
        id: cover_feedback.id,
        verdict: cover_feedback.verdict,
        note: cover_feedback.note,
        status: cover_feedback.status,
        createdAt: sql<string>`to_char(${cover_feedback.created_at}, 'YYYY-MM-DD HH24:MI')`,
        reportedWorkId: cover_feedback.openlibrary_work_id,
        resolution: cover_feedback.resolution,
        resolvedBy: sql<string | null>`(
          select u.email from ${web_user} u where u.id = ${cover_feedback.resolved_by}
        )`,
        imageId: image.id,
        source: image.source,
        extension: image.extension,
        blurhash: image.blurhash,
        currentWorkId: image.openlibrary_work_id,
        currentConfidence: image.openlibrary_work_id_confidence,
        title: openlibrary_work.title,
        authorNames: openlibrary_work.author_names,
      })
      .from(cover_feedback)
      .innerJoin(image, eq(image.id, cover_feedback.image_id))
      .leftJoin(
        openlibrary_work,
        eq(openlibrary_work.olid, image.openlibrary_work_id),
      )
      .where(eq(cover_feedback.status, data.status))
      .orderBy(desc(cover_feedback.created_at))
      .limit(100);

    const images = await shapeImageDataArray(
      rows.map((row) =>
        DBImageDataValidator.parse({
          id: row.imageId,
          source: row.source,
          extension: row.extension,
          blurhash: row.blurhash,
        }),
      ),
    );

    return rows.map((row, index) => ({
      id: row.id,
      verdict: row.verdict as z.infer<typeof verdictValidator>,
      note: row.note,
      status: row.status,
      createdAt: row.createdAt,
      reportedWorkId: row.reportedWorkId,
      resolution: row.resolution,
      resolvedBy: row.resolvedBy,
      /** True when the match already moved on since the report was filed. */
      matchChangedSinceReport:
        row.reportedWorkId !== row.currentWorkId,
      currentWorkId: row.currentWorkId,
      currentConfidence: row.currentConfidence,
      title: row.title,
      authorNames: (row.authorNames ?? []) as string[],
      image: images[index],
    }));
  });

/**
 * Everything the triage screen needs for one report, including the candidate
 * works to repoint to.
 */
export const getFeedbackDetail = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const readDb = createReadDb();

    const [row] = await readDb
      .select({
        id: cover_feedback.id,
        verdict: cover_feedback.verdict,
        note: cover_feedback.note,
        status: cover_feedback.status,
        createdAt: sql<string>`to_char(${cover_feedback.created_at}, 'YYYY-MM-DD HH24:MI')`,
        reportedWorkId: cover_feedback.openlibrary_work_id,
        imageId: image.id,
        source: image.source,
        extension: image.extension,
        blurhash: image.blurhash,
        currentWorkId: image.openlibrary_work_id,
        currentConfidence: image.openlibrary_work_id_confidence,
        title: openlibrary_work.title,
        subtitle: openlibrary_work.subtitle,
        authorNames: openlibrary_work.author_names,
        firstPublishYear: openlibrary_work.first_publish_year,
      })
      .from(cover_feedback)
      .innerJoin(image, eq(image.id, cover_feedback.image_id))
      .leftJoin(
        openlibrary_work,
        eq(openlibrary_work.olid, image.openlibrary_work_id),
      )
      .where(eq(cover_feedback.id, data.id))
      .limit(1);

    if (!row) {
      throw new Error("That report does not exist.");
    }

    const [shaped] = await shapeImageDataArray([
      DBImageDataValidator.parse({
        id: row.imageId,
        source: row.source,
        extension: row.extension,
        blurhash: row.blurhash,
      }),
    ]);

    const authorNames = (row.authorNames ?? []) as string[];
    const candidates = await loadAuthorWorks(
      authorNames,
      row.currentWorkId ?? null,
    );

    return {
      id: row.id,
      verdict: row.verdict as z.infer<typeof verdictValidator>,
      note: row.note,
      status: row.status,
      createdAt: row.createdAt,
      reportedWorkId: row.reportedWorkId,
      matchChangedSinceReport: row.reportedWorkId !== row.currentWorkId,
      image: shaped,
      current: row.currentWorkId
        ? {
            workId: row.currentWorkId,
            confidence: row.currentConfidence,
            title: row.title,
            subtitle: row.subtitle,
            authorNames,
            firstPublishYear: row.firstPublishYear,
          }
        : null,
      candidates,
    };
  });

/**
 * Other works by the same author(s), with how many covers already point at each.
 *
 * The match count is the useful signal: when one book has several OpenLibrary
 * work ids, the one that already carries covers is almost always the id worth
 * consolidating on, so it sorts to the top.
 */
async function loadAuthorWorks(authorNames: string[], excludeOlid: string | null) {
  if (authorNames.length === 0) return [];
  const readDb = createReadDb();

  const authorArray = sql`ARRAY[${sql.join(
    authorNames.map((name) => sql`${name}`),
    sql`, `,
  )}]::text[]`;

  const rows = await readDb
    .select({
      workId: openlibrary_work.olid,
      title: openlibrary_work.title,
      subtitle: openlibrary_work.subtitle,
      authorNames: openlibrary_work.author_names,
      firstPublishYear: openlibrary_work.first_publish_year,
      editionCount: openlibrary_work.edition_count,
      matchCount: sql<number>`(
        select count(*)::int from ${image} i
        where i.openlibrary_work_id = ${openlibrary_work.olid}
          and i.deleted is false
      )`,
    })
    .from(openlibrary_work)
    .where(
      and(
        sql`${openlibrary_work.author_names} && ${authorArray}`,
        excludeOlid ? ne(openlibrary_work.olid, excludeOlid) : undefined,
      ),
    )
    .orderBy(
      sql`(select count(*) from ${image} i where i.openlibrary_work_id = ${openlibrary_work.olid} and i.deleted is false) DESC`,
      sql`${openlibrary_work.edition_count} DESC NULLS LAST`,
    )
    .limit(40);

  return rows.map((row) => ({
    ...row,
    authorNames: (row.authorNames ?? []) as string[],
  }));
}

/**
 * Resolves an OpenLibrary URL, `/works/OL…W` path, or bare OLID into a work.
 *
 * Falls back to OpenLibrary's API when the id is not in the local catalogue, so
 * a freshly created work can be used before the next ETL run picks it up.
 */
export const lookupOpenLibraryWork = createServerFn({ method: "POST" })
  .inputValidator(z.object({ reference: z.string().trim().min(1).max(500) }))
  .handler(async ({ data }) => {
    await requireAdmin();

    const workId = parseOpenLibraryWorkId(data.reference);
    if (!workId) {
      throw new Error(
        "Could not find an OpenLibrary work id in that. Paste a link like https://openlibrary.org/works/OL45883W or the id itself.",
      );
    }

    const readDb = createReadDb();
    const [local] = await readDb
      .select({
        workId: openlibrary_work.olid,
        title: openlibrary_work.title,
        subtitle: openlibrary_work.subtitle,
        authorNames: openlibrary_work.author_names,
        firstPublishYear: openlibrary_work.first_publish_year,
        editionCount: openlibrary_work.edition_count,
        matchCount: sql<number>`(
          select count(*)::int from ${image} i
          where i.openlibrary_work_id = ${openlibrary_work.olid}
            and i.deleted is false
        )`,
      })
      .from(openlibrary_work)
      .where(eq(openlibrary_work.olid, workId))
      .limit(1);

    if (local) {
      return {
        ...local,
        authorNames: (local.authorNames ?? []) as string[],
        inCatalogue: true as const,
      };
    }

    const remote = await fetchOpenLibraryWork(workId);
    if (!remote) {
      throw new Error(`OpenLibrary has no work ${workId}.`);
    }

    // Insert so the site can render the title immediately. The monthly ETL
    // rebuilds this table wholesale, which will replace this row with the
    // authoritative one.
    const writeDb = createWriteDb();
    await writeDb
      .insert(openlibrary_work)
      .values({
        olid: remote.workId,
        title: remote.title,
        author_names: remote.authorNames,
        first_publish_year: remote.firstPublishYear,
        edition_count: remote.editionCount,
      })
      .onConflictDoNothing();

    return { ...remote, subtitle: null, matchCount: 0, inCatalogue: false as const };
  });

async function fetchOpenLibraryWork(workId: string) {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", `key:"/works/${workId}"`);
  url.searchParams.set(
    "fields",
    "key,title,author_name,first_publish_year,edition_count",
  );
  const response = await fetch(url, {
    headers: { "User-Agent": "audiobookcovers.com (admin match tool)" },
  });
  if (!response.ok) return null;

  const parsed = z
    .object({
      docs: z.array(
        z.object({
          key: z.string(),
          title: z.string().optional(),
          author_name: z.array(z.string()).optional(),
          first_publish_year: z.number().int().optional(),
          edition_count: z.number().int().optional(),
        }),
      ),
    })
    .safeParse(await response.json());

  const doc = parsed.success ? parsed.data.docs[0] : undefined;
  if (!doc) return null;

  return {
    workId,
    title: doc.title ?? workId,
    authorNames: doc.author_name ?? [],
    firstPublishYear: doc.first_publish_year ?? null,
    editionCount: doc.edition_count ?? null,
  };
}

/**
 * Triage actions.
 *
 * `confirm` and `repoint` both stamp the match HUMAN, which is the whole point
 * of the queue: a person looked at it. Only the one cover in the report is
 * touched.
 */
export const resolveFeedback = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.uuid(),
      action: z.enum(["confirm", "repoint", "unmatch", "dismiss"]),
      workId: z.string().trim().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const writeDb = createWriteDb();

    const [report] = await writeDb
      .select({ imageId: cover_feedback.image_id })
      .from(cover_feedback)
      .where(eq(cover_feedback.id, data.id))
      .limit(1);

    if (!report) {
      throw new Error("That report does not exist.");
    }

    let resolution: string;
    switch (data.action) {
      case "confirm": {
        await writeDb
          .update(image)
          .set({ openlibrary_work_id_confidence: "HUMAN" })
          .where(eq(image.id, report.imageId));
        resolution = "Match confirmed";
        break;
      }
      case "repoint": {
        const workId = parseOpenLibraryWorkId(data.workId ?? "");
        if (!workId) {
          throw new Error("Choose a work to point this cover at.");
        }
        await writeDb
          .update(image)
          .set({
            openlibrary_work_id: workId,
            openlibrary_work_id_confidence: "HUMAN",
          })
          .where(eq(image.id, report.imageId));
        resolution = `Repointed to ${workId}`;
        break;
      }
      case "unmatch": {
        await writeDb
          .update(image)
          .set({
            openlibrary_work_id: null,
            openlibrary_work_id_confidence: "NO_MATCH",
          })
          .where(eq(image.id, report.imageId));
        resolution = "Match removed";
        break;
      }
      case "dismiss": {
        resolution = "Dismissed";
        break;
      }
    }

    await writeDb
      .update(cover_feedback)
      .set({
        status: data.action === "dismiss" ? "DISMISSED" : "RESOLVED",
        resolved_by: admin.id,
        resolved_at: sql`NOW()`,
        resolution,
      })
      .where(eq(cover_feedback.id, data.id));

    // Other open reports about the same cover are answered by this decision.
    if (data.action !== "dismiss") {
      await writeDb
        .update(cover_feedback)
        .set({
          status: "RESOLVED",
          resolved_by: admin.id,
          resolved_at: sql`NOW()`,
          resolution: `${resolution} (via another report)`,
        })
        .where(
          and(
            eq(cover_feedback.image_id, report.imageId),
            eq(cover_feedback.status, "OPEN"),
            ne(cover_feedback.id, data.id),
          ),
        );
    }

    await captureAnalyticsEvent({
      data: {
        eventType: "coverFeedbackResolved",
        payload: {
          feedbackId: data.id,
          action: data.action,
          byUserId: admin.id,
        },
      },
    });

    return { success: true, resolution };
  });

export const getFeedbackCounts = createServerFn().handler(async () => {
  await requireAdmin();
  const readDb = createReadDb();
  const rows = await readDb
    .select({
      status: cover_feedback.status,
      count: sql<number>`count(*)::int`,
    })
    .from(cover_feedback)
    .where(inArray(cover_feedback.status, ["OPEN", "RESOLVED", "DISMISSED"]))
    .groupBy(cover_feedback.status);

  const counts = { OPEN: 0, RESOLVED: 0, DISMISSED: 0 };
  for (const row of rows) {
    if (row.status in counts) {
      counts[row.status as keyof typeof counts] = row.count;
    }
  }
  return counts;
});
