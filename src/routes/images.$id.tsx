import { createFileRoute, useRouter } from "@tanstack/react-router";
import { getImageByIdAndSimilar } from "@/server/imageSearcherAI";
import ImageCard from "@/components/ImageCard";
import { Button } from "@/components/ui/button";
import {
  BadgeCheck,
  BookOpen,
  Download,
  ExternalLink,
  SearchCheck,
  SearchX,
  Sparkles,
} from "lucide-react";
import { setImageNotSearchable, setImageSearchable } from "@/server/crud";
import { toast, Toaster } from "sonner";
import { getIsAuthenticated } from "@/server/auth";
import { ClientOnly } from "@/components/ClientOnly";
import { DownloadButton } from "@/components/DownloadButton";
import type { ImageData } from "@/server/imageData";

export const Route = createFileRoute("/images/$id")({
  component: RouteComponent,
  loader: async ({ params }) => {
    return {
      images: await getImageByIdAndSimilar({ data: params.id }),
      auth: await getIsAuthenticated(),
    };
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
  NO_MATCH: "No match",
} as const satisfies Record<
  NonNullable<ImageData["openLibraryWorkIdConfidence"]>,
  string
>;

function formatConfidence(confidence: ImageData["openLibraryWorkIdConfidence"]) {
  if (!confidence) return null;
  return confidenceLabels[confidence];
}

function RouteComponent() {
  const {
    images: [image, ...similar],
    auth,
  } = Route.useLoaderData();
  const router = useRouter();

  function toggleSearchable() {
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

  if (!image) {
    return <div className="text-center text-lg mt-16">Image not found</div>;
  }

  const openlibraryUrl = image.openlibraryWorkId
    ? `https://openlibrary.org/works/${image.openlibraryWorkId}`
    : null;
  const openlibraryConfidence = formatConfidence(
    image.openLibraryWorkIdConfidence,
  );
  const openlibraryWork =
    "openlibraryWork" in image ? image.openlibraryWork : undefined;
  const openlibraryTitle =
    openlibraryWork &&
    [openlibraryWork.title, openlibraryWork.subtitle]
      .filter(Boolean)
      .join(": ");
  const openlibraryAuthors = openlibraryWork
    ? formatList(openlibraryWork.authorNames)
    : "";
  const isHumanMatched = image.openLibraryWorkIdConfidence === "HUMAN";
  const MatchSourceIcon = isHumanMatched ? BadgeCheck : Sparkles;
  const matchDescription =
    isHumanMatched
      ? "This match was confirmed by a human."
      : openlibraryConfidence
        ? `This ${openlibraryConfidence.toLowerCase()} match was made using AI.`
        : "This match was made using AI.";

  return (
    <div className="flex flex-col items-center w-full px-4 py-8">
      <div className="flex flex-col items-center bg-white/80 rounded-2xl shadow-lg p-6 mb-8 max-w-lg w-full">
        <ImageCard imageData={image} className="max-w-96 w-full mb-4" />
        <div className="flex flex-col items-center gap-2 w-full">
          {auth.isAuthenticated && (
            <Button className="w-full" onClick={toggleSearchable}>
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
          <Button asChild className="w-full">
            <a href={image.source} target="_blank" rel="noopener noreferrer">
              <span>View Source</span>
              <ExternalLink />
            </a>
          </Button>
          <ClientOnly>
            <DownloadButton image={image}>
              <span>Download</span>
              <Download />
            </DownloadButton>
          </ClientOnly>
        </div>

        {(openlibraryWork || image.openlibraryWorkId) && (
          <section className="mt-5 w-full border-t border-slate-200 pt-5 text-center text-slate-900">
            <div className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold uppercase text-slate-500">
              <BookOpen className="size-4 shrink-0" />
              <span>Matched Book</span>
            </div>

            {openlibraryTitle && (
              <h2 className="text-xl font-semibold leading-tight">
                {openlibraryTitle}
              </h2>
            )}

            {openlibraryAuthors && (
              <p className="mt-2 text-sm font-medium text-slate-700">
                {openlibraryAuthors}
              </p>
            )}

            {openlibraryWork?.firstPublishYear && (
              <p className="mt-1 text-sm text-slate-500">
                First published {openlibraryWork.firstPublishYear}
              </p>
            )}

            {openlibraryUrl && (
              <a
                href={openlibraryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
              >
                <span>OpenLibrary.org</span>
                <ExternalLink className="size-4" />
              </a>
            )}

            <p
              className={
                isHumanMatched
                  ? "mx-auto mt-4 flex max-w-72 items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium leading-snug text-emerald-800"
                  : "mx-auto mt-4 flex max-w-72 items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium leading-snug text-amber-900"
              }
            >
              <MatchSourceIcon className="size-4 shrink-0" />
              {matchDescription}
            </p>
          </section>
        )}
      </div>

      {similar && similar.length > 0 && (
        <div className="w-full max-w-5xl">
          <h2 className="text-xl font-semibold mb-4 text-center">
            Similar Images
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {similar.map((image) => (
              <ImageCard
                key={image.id}
                imageData={image}
                showScore={auth.isAuthenticated}
                showDataset={auth.isAuthenticated}
              />
            ))}
          </div>
        </div>
      )}
      <Toaster />
    </div>
  );
}
