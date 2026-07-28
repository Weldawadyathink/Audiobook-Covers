import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { getImageDetail } from "@/server/imageSearcherAI";
import ImageCard from "@/components/ImageCard";
import { Panel } from "@/components/Panel";
import { SectionHeading } from "@/components/SectionHeading";
import { Button } from "@/components/ui/button";
import {
  BadgeCheck,
  BookOpen,
  Download,
  ExternalLink,
  Images,
  Library,
  Search,
  SearchCheck,
  SearchX,
  Sparkles,
} from "lucide-react";
import { setImageNotSearchable, setImageSearchable } from "@/server/crud";
import { toast, Toaster } from "sonner";
import { getIsAuthenticated } from "@/server/auth";
import { ClientOnly } from "@/components/ClientOnly";
import { DownloadButton } from "@/components/DownloadButton";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import type { ImageData } from "@/server/imageData";

export const Route = createFileRoute("/images/$id")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const [detail, auth] = await Promise.all([
      getImageDetail({ data: params.id }),
      getIsAuthenticated(),
    ]);
    return { detail, auth };
  },
});

function formatList(values: string[]) {
  return values.filter(Boolean).join(", ");
}

const confidenceLabels = {
  UNCERTAIN: "Uncertain",
  LIKELY: "Likely",
  CONFIRMED: "Confirmed",
  HUMAN: "Human",
} as const satisfies Record<
  NonNullable<ImageData["openlibrary"]>["confidence"],
  string
>;

function formatConfidence(
  confidence: NonNullable<ImageData["openlibrary"]>["confidence"],
) {
  return confidenceLabels[confidence];
}

function CoverShelf({
  eyebrow,
  title,
  description,
  images,
  showBook,
  showScore,
  showDataset,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  images: ImageData[];
  showBook?: boolean;
  showScore?: boolean;
  showDataset?: boolean;
}) {
  if (images.length === 0) return null;
  return (
    <section className="mt-12">
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        className="mb-5"
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
        {images.map((image) => (
          <ImageCard
            key={image.id}
            imageData={image}
            showBook={showBook}
            showScore={showScore}
            showDataset={showDataset}
          />
        ))}
      </div>
    </section>
  );
}

function RouteComponent() {
  const {
    detail: { image, sameBook, sameAuthor, similar },
    auth,
  } = Route.useLoaderData();
  const router = useRouter();

  if (!image) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-white">Cover not found</h1>
        <p className="mt-3 text-slate-400">
          This cover may have been removed from the archive.
        </p>
        <Link
          to="/search"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-cyan-200 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-100"
        >
          <Search className="size-4" />
          Search covers
        </Link>
      </div>
    );
  }

  function toggleSearchable() {
    if (!image) return;
    if (image.searchable) {
      toast("Setting image as not searchable");
      setImageNotSearchable({ data: { id: image.id } }).then(() =>
        router.invalidate(),
      );
    } else {
      toast("Setting image as searchable");
      setImageSearchable({ data: { id: image.id } }).then(() =>
        router.invalidate(),
      );
    }
  }

  const openlibrary = image.openlibrary;
  const openlibraryConfidence = openlibrary
    ? formatConfidence(openlibrary.confidence)
    : null;
  const openlibraryTitle =
    openlibrary &&
    [openlibrary.title, openlibrary.subtitle].filter(Boolean).join(": ");
  const openlibraryAuthors = openlibrary
    ? formatList(openlibrary.authorNames)
    : "";
  const primaryAuthor = openlibrary?.authorNames.filter(Boolean)[0];
  const isHumanMatched = openlibrary?.confidence === "HUMAN";
  const MatchSourceIcon = isHumanMatched ? BadgeCheck : Sparkles;
  const matchDescription = isHumanMatched
    ? "This match was confirmed by a human."
    : openlibraryConfidence
      ? `This ${openlibraryConfidence.toLowerCase()} match was made using AI.`
      : "This match was made using AI.";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,32rem)_minmax(0,20rem)] lg:items-start lg:justify-start">
        <Panel className="overflow-hidden p-3 sm:p-4">
          <div
            className="relative aspect-square w-full overflow-hidden rounded-2xl"
            style={{
              boxShadow: `0 0 60px hsla(${image.primaryColor.hue}, ${image.primaryColor.saturation}%, ${image.primaryColor.lightness * 0.6}%, 0.45)`,
            }}
          >
            <img
              src={image.blurhashUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full"
            />
            <picture>
              <source
                type="image/webp"
                srcSet={`${image.webp["640"]} 640w, ${image.webp["1280"]} 1280w`}
                sizes="(max-width: 1024px) 100vw, 60vw"
              />
              <img
                src={image.jpeg["1280"]}
                alt={
                  openlibraryTitle
                    ? `Audiobook cover for ${openlibraryTitle}`
                    : "Audiobook cover"
                }
                className="absolute inset-0 h-full w-full"
              />
            </picture>
          </div>
        </Panel>

        <Panel className="p-5 sm:p-6">
          {openlibrary ? (
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                <BookOpen className="size-3.5" />
                Matched book
              </div>
              <h1 className="mt-3 text-2xl font-bold leading-tight text-white">
                {openlibraryTitle}
              </h1>
              {openlibraryAuthors && (
                <p className="mt-2 text-base text-slate-300">
                  {openlibraryAuthors}
                </p>
              )}
              {openlibrary.firstPublishYear && (
                <p className="mt-1 text-sm text-slate-500">
                  First published {openlibrary.firstPublishYear}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/search"
                  search={{ title: openlibrary.title ?? undefined }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/25 hover:bg-white/10"
                >
                  <Search className="size-3.5" />
                  Search this title
                </Link>
                <a
                  href={openlibrary.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/25 hover:bg-white/10"
                >
                  OpenLibrary
                  <ExternalLink className="size-3.5" />
                </a>
              </div>

              <p
                className={cn(
                  "mt-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-snug",
                  isHumanMatched
                    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                    : "border-amber-400/25 bg-amber-400/10 text-amber-100",
                )}
              >
                <MatchSourceIcon className="mt-0.5 size-3.5 shrink-0" />
                {matchDescription}
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                <BookOpen className="size-3.5" />
                Unmatched cover
              </div>
              <h1 className="mt-3 text-xl font-bold leading-tight text-white">
                Not yet matched to a book
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                This cover has not been linked to an OpenLibrary work, so it only
                turns up in visual search.
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2 border-t border-white/8 pt-5">
            <ClientOnly>
              <DownloadButton
                image={image}
                className="h-11 rounded-xl bg-cyan-200 font-bold text-slate-950 hover:bg-cyan-100"
              >
                <span>Download original</span>
                <Download />
              </DownloadButton>
            </ClientOnly>
            <Button
              asChild
              variant="outline"
              className="h-11 w-full rounded-xl border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
            >
              <a href={image.source} target="_blank" rel="noopener noreferrer">
                <span>View source</span>
                <ExternalLink />
              </a>
            </Button>
            {auth.isAuthenticated && (
              <Button
                variant="outline"
                className="h-11 w-full rounded-xl border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
                onClick={toggleSearchable}
              >
                {image.searchable ? (
                  <>
                    <span>Searchable</span>
                    <SearchCheck />
                  </>
                ) : (
                  <>
                    <span>Not Searchable</span>
                    <SearchX />
                  </>
                )}
              </Button>
            )}
          </div>
        </Panel>
      </div>

      <CoverShelf
        eyebrow={<span className="inline-flex items-center gap-1.5">Same book</span>}
        title="More covers for this book"
        description={
          openlibraryTitle
            ? `Other artwork matched to ${openlibraryTitle}.`
            : undefined
        }
        images={sameBook}
        showDataset={auth.isAuthenticated}
      />

      <CoverShelf
        eyebrow="Same author"
        title={primaryAuthor ? `More by ${primaryAuthor}` : "More by this author"}
        description="Covers for other books by this author. Hover a cover to see which book it belongs to."
        images={sameAuthor}
        showBook
        showDataset={auth.isAuthenticated}
      />

      <CoverShelf
        eyebrow="Looks alike"
        title="Visually similar covers"
        description="Matched by artwork rather than by book."
        images={similar}
        showScore={auth.isAuthenticated}
        showDataset={auth.isAuthenticated}
      />

      {sameBook.length === 0 && sameAuthor.length === 0 && similar.length === 0 && (
        <p className="mt-12 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Images className="size-4" />
          No related covers found.
        </p>
      )}

      <div className="mt-14 flex justify-center">
        <Link
          to="/search"
          className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-white/25 hover:bg-white/10"
        >
          <Library className="size-4" />
          Search the archive
        </Link>
      </div>

      <Toaster />
    </div>
  );
}
