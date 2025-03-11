import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="mx-8 mt-4">
      <h1 className="text-2xl">Recent Site Updates</h1>
      <p>
        The previous revision of the website used Vercel for hosting, Replicate
        for AI processing, and Supabase for database hosting. This proved to be
        a powerful platform that allowed me to build a fast and responsive
        website. I enjoyed programming with all of these services, and I liked
        the final website I was able to make. However there was one big problem
        with this setup: cost. My Supabase and Vercel usage stayed below the
        free tier limits, but my Replicate usage did not. I expected to pay a
        small amount to replicate when designing the website, and built Google
        Adsense to pay for costs. Unfortunately the Replicate usage was larger
        than I expected, and the revenue from advertising was almost nothing. I
        am currently a student with no income, so I had to set a spend limit on
        Replicate. This meant the website was unusable for part of every month
        once the costs exceeded my spend limit.
      </p>
      <p>
        With the unexpected costs in mind, I started yet another rewrite of the
        website. Vercel is a fantastic platform, but staying within the free
        limits is...well...limiting. The new platform is hostable in a docker
        container. It does the AI inference at the server, therefore faster
        searches and no Replicate costs. I switched the database from postgres
        to duckDB, so there is no external database to worry about. This rewrite
        has some drawbacks. It may not be available as consistently, since my
        hosting is certainly less robust than Vercel. But it should no longer
        cost me a significant amount to host.
      </p>
    </div>
  );
}
