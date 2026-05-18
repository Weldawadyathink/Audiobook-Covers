import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createReadDb } from "@/server/db";
import StatCard from "@/components/StatCard";
import { image } from "@/db/schema";
import { desc, isNotNull, sql } from "drizzle-orm";

const getDatabaseStats = createServerFn().handler(async () => {
  console.log("ADMIN: Getting database statistics.");
  const readDb = createReadDb();
  const [overallStats] = await readDb
    .select({
      total: sql<number>`COUNT(*)::int`,
      deleted: sql<number>`COUNT(*) FILTER (WHERE ${image.deleted} = TRUE)::int`,
      searchable: sql<number>`COUNT(*) FILTER (WHERE ${image.searchable} = TRUE)::int`,
    })
    .from(image);

  if (!overallStats) {
    throw new Error("Could not load database statistics.");
  }

  const extensionCount = sql<number>`COUNT(*)::int`;
  const extensionStats = await readDb
    .select({
      extension: image.extension,
      count: extensionCount,
    })
    .from(image)
    .where(isNotNull(image.extension))
    .groupBy(image.extension)
    .orderBy(desc(extensionCount))
    .limit(10);

  return {
    overall: overallStats,
    extensions: extensionStats,
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
  const { stats } = Route.useLoaderData() as {
    stats: Awaited<ReturnType<typeof getDatabaseStats>>;
  };

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
    </div>
  );
}
