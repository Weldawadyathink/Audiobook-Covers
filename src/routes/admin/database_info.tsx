import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getDbPool, sql } from "@/server/db";
import { z } from "zod/v4";
import StatCard from "@/components/StatCard";

const getDatabaseStats = createServerFn().handler(async () => {
  console.log("ADMIN: Getting database statistics.");
  const pool = await getDbPool();

  // Get overall image statistics
  const overallStats = await pool.one(
    sql.type(
      z.object({
        total: z.number(),
        deleted: z.number(),
        searchable: z.number(),
      })
    )`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE deleted = TRUE)::int AS deleted,
        COUNT(*) FILTER (WHERE searchable = TRUE)::int AS searchable
      FROM image
    `
  );

  // Get images by extension
  const extensionStats = await pool.many(
    sql.type(
      z.object({
        extension: z.string().nullable(),
        count: z.number(),
      })
    )`
      SELECT
        extension,
        COUNT(*)::int AS count
      FROM image
      WHERE extension IS NOT NULL
      GROUP BY extension
      ORDER BY count DESC
      LIMIT 10
    `
  );

  // Get analytics event counts
  const analyticsStats = await pool.one(
    sql.type(
      z.object({
        totalEvents: z.number(),
        imageDeletedEvents: z.number(),
        imageUndeletedEvents: z.number(),
        recentEvents: z.number(),
      })
    )`
      SELECT
        COUNT(*)::int AS totalEvents,
        COUNT(*) FILTER (WHERE event_type = 'imageDeleted')::int AS imageDeletedEvents,
        COUNT(*) FILTER (WHERE event_type = 'imageUndeleted')::int AS imageUndeletedEvents,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS recentEvents
      FROM analytics_event
    `
  );

  return {
    overall: overallStats,
    extensions: extensionStats,
    analytics: analyticsStats,
  };
});

export const Route = createFileRoute("/admin/database_info")({
  component: RouteComponent,
  loader: async () => {
    return {
      stats: await getDatabaseStats(),
    };
  },
});

function RouteComponent() {
  const { stats } = Route.useLoaderData() as { stats: Awaited<ReturnType<typeof getDatabaseStats>> };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-white">
        Database Statistics
      </h1>

      {/* Overall Statistics */}
      <section className="mb-6 sm:mb-8">
        <h2 className="text-lg sm:text-xl font-semibold mb-4 text-slate-200">
          Overall Image Statistics
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            title="Total Images"
            value={stats.overall.total}
            description="All images in the database"
          />
          <StatCard
            title="Deleted"
            value={stats.overall.deleted}
            description={`${((stats.overall.deleted / stats.overall.total) * 100).toFixed(1)}% of total`}
          />
          <StatCard
            title="Searchable"
            value={stats.overall.searchable}
            description={`${((stats.overall.searchable / stats.overall.total) * 100).toFixed(1)}% of total`}
          />
        </div>
      </section>

      {/* Extension Statistics */}
      <section className="mb-6 sm:mb-8">
        <h2 className="text-lg sm:text-xl font-semibold mb-4 text-slate-200">
          Images by Extension
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {stats.extensions.map((ext) => (
            <StatCard
              key={ext.extension || "null"}
              title={ext.extension || "null"}
              value={ext.count}
              description={`${((ext.count / stats.overall.total) * 100).toFixed(1)}% of total`}
            />
          ))}
        </div>
      </section>

      {/* Analytics Statistics */}
      <section className="mb-6 sm:mb-8">
        <h2 className="text-lg sm:text-xl font-semibold mb-4 text-slate-200">
          Analytics Statistics
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Events"
            value={stats.analytics.totalEvents}
            description="All analytics events"
          />
          <StatCard
            title="Image Deleted Events"
            value={stats.analytics.imageDeletedEvents}
            description="Times images were deleted"
          />
          <StatCard
            title="Image Undeleted Events"
            value={stats.analytics.imageUndeletedEvents}
            description="Times images were restored"
          />
          <StatCard
            title="Recent Events (7 days)"
            value={stats.analytics.recentEvents}
            description="Events in the last week"
          />
        </div>
      </section>
    </div>
  );
}

