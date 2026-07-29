import { createFileRoute, Link } from "@tanstack/react-router";
import { getRandom } from "@/server/imageSearcherAI";
import ImageCard from "@/components/ImageCard";
import { cn } from "@/lib/utils";
import { getIsAuthenticated } from "@/server/auth";
import { Search, Shuffle, Sparkles } from "lucide-react";

function isLargeImageLg(index: number) {
  const repeatInterval = 15; // Pattern repeats every 15 numbers
  const select = new Set([1, 9, 10]); // Select large images by modulus
  return select.has(index % repeatInterval);
}

function isLargeImageMd(index: number) {
  const repeatInterval = 7;
  const select = new Set([3]);
  return select.has(index % repeatInterval);
}

function getLargeImageClass(index: number) {
  const isLg = isLargeImageLg(index);
  const isMd = isLargeImageMd(index);
  return cn(
    isMd && "md:max-lg:col-span-2 md:max-lg:row-span-2",
    isLg && "lg:col-span-2 lg:row-span-2",
  );
}

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => {
    return {
      images: await getRandom(),
      auth: await getIsAuthenticated(),
    };
  },
});

function Home() {
  const { images, auth } = Route.useLoaderData();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <section className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Cover art for every audiobook
          <br className="hidden sm:block" />{" "}
          <span className="bg-linear-to-r from-cyan-200 to-violet-300 bg-clip-text text-transparent">
            in your library
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-300">
          A searchable archive of custom covers made by the community at
          r/audiobookcovers. Free to browse, free to download.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/search"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-200 px-7 text-base font-bold text-slate-950 shadow-lg shadow-cyan-950/30 transition-colors hover:bg-cyan-100 sm:w-auto"
          >
            <Search className="size-4" />
            Search by book
          </Link>
          <Link
            to="/search"
            search={{ mode: "visual" }}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-7 text-base font-semibold text-slate-100 transition-colors hover:border-white/30 hover:bg-white/10 sm:w-auto"
          >
            <Sparkles className="size-4 text-violet-200" />
            Search by artwork
          </Link>
        </div>
      </section>

      <section className="mt-14">
        <div className="mb-5 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          <Shuffle className="size-3.5" />A random shelf from the archive
        </div>
        <div className="grid grid-cols-2 justify-center gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
          {images.map((image, index) => (
            <ImageCard
              key={image.id}
              imageData={image}
              showDataset={auth.isAdmin}
              className={getLargeImageClass(index)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
