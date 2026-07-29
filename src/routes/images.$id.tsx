import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getImageDetail } from "@/server/imageSearcherAI";
import ImageCard from "@/components/ImageCard";
import { Panel } from "@/components/Panel";
import { SectionHeading } from "@/components/SectionHeading";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Download,
  ExternalLink,
  Images,
  Library,
  Search,
  SearchCheck,
  SearchX,
  BadgeCheck,
} from "lucide-react";
import {
  confirmImageMatch,
  setImageNotSearchable,
  setImageSearchable,
} from "@/server/crud";
import { toast, Toaster } from "sonner";
import { getIsAuthenticated } from "@/server/auth";
import { ClientOnly } from "@/components/ClientOnly";
import { DownloadButton } from "@/components/DownloadButton";
import { MatchAttribution } from "@/components/MatchAttribution";
import { CoverFeedback } from "@/components/CoverFeedback";
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

/**
 * Admin-only controls, kept visually apart from the public actions so there is
 * no chance of mistaking one for the other.
 */
function AdminActions({
  imageId,
  searchable,
  hasMatch,
  isConfirmed,
  onToggleSearchable,
}: {
  imageId: string;
  searchable: boolean;
  hasMatch: boolean;
  isConfirmed: boolean;
  onToggleSearchable: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await confirmImageMatch({ data: { id: imageId } });
      toast("Match confirmed");
      await router.invalidate();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not confirm");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        Admin
      </p>
      <div className="mt-2.5 flex flex-col gap-2">
        {hasMatch &&
          (isConfirmed ? (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
              <BadgeCheck className="size-3.5 shrink-0" />
              You have confirmed this match.
            </p>
          ) : (
            <Button
              type="button"
              disabled={busy}
              onClick={confirm}
              className="h-10 w-full rounded-lg bg-emerald-300 text-sm font-bold text-slate-950 hover:bg-emerald-200"
            >
              <BadgeCheck className="size-4" />
              Confirm this match
            </Button>
          ))}
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full rounded-lg border-white/15 bg-white/5 text-sm text-slate-100 hover:bg-white/10 hover:text-white"
          onClick={onToggleSearchable}
        >
          {searchable ? (
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
      </div>
    </div>
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
  const openlibraryTitle =
    openlibrary &&
    [openlibrary.title, openlibrary.subtitle].filter(Boolean).join(": ");
  const openlibraryAuthors = openlibrary
    ? formatList(openlibrary.authorNames)
    : "";
  const primaryAuthor = openlibrary?.authorNames.filter(Boolean)[0];

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

              <MatchAttribution confidence={openlibrary.confidence} />
              <CoverFeedback imageId={image.id} />
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
                This cover has not been linked to an OpenLibrary work, so it
                only turns up in visual search.
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
          </div>

          {auth.isAdmin && (
            <AdminActions
              imageId={image.id}
              searchable={Boolean(image.searchable)}
              hasMatch={Boolean(openlibrary)}
              isConfirmed={openlibrary?.confidence === "HUMAN"}
              onToggleSearchable={toggleSearchable}
            />
          )}
        </Panel>
      </div>

      <CoverShelf
        eyebrow={
          <span className="inline-flex items-center gap-1.5">Same book</span>
        }
        title="More covers for this book"
        description={
          openlibraryTitle
            ? `Other artwork matched to ${openlibraryTitle}.`
            : undefined
        }
        images={sameBook}
        showDataset={auth.isAdmin}
      />

      <CoverShelf
        eyebrow="Same author"
        title={
          primaryAuthor ? `More by ${primaryAuthor}` : "More by this author"
        }
        description="Covers for other books by this author. Hover a cover to see which book it belongs to."
        images={sameAuthor}
        showBook
        showDataset={auth.isAdmin}
      />

      <CoverShelf
        eyebrow="Looks alike"
        title="Visually similar covers"
        description="Matched by artwork rather than by book."
        images={similar}
        showScore={auth.isAdmin}
        showDataset={auth.isAdmin}
      />

      {sameBook.length === 0 &&
        sameAuthor.length === 0 &&
        similar.length === 0 && (
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
