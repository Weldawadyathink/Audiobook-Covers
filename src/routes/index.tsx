import { createFileRoute } from "@tanstack/react-router";
import { api } from "../utils/trpc.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { ImageCard } from "../components/ImageCard.tsx";
import { cn } from "../utils/utils.ts";

function cssGridLargeItem3Column<T extends object>(
  input: T,
  index: number,
): T & { isLargeImage: boolean } {
  // Makes some images larger in a CSS grid. Meant for 3 columns.
  // Large images are square, and occupy 2x2 grid spacing.
  const isLargeImage = (index % 6) == 1 || (index % 6) == 3;
  return {
    isLargeImage,
    ...input,
  };
}

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const images = api.cover.getRandom.useQuery();

  return (
    <>
      {images.isLoading && <Spinner />}
      {images.isSuccess && (
        <div className="grid md:grid-cols-3 justify-center gap-6 sm:grid-cols-2 mx-6 my-6">
          {images.data.length === 0 && <p>Could not find any results</p>}
          {images.data.map(cssGridLargeItem3Column).map((image, index) => (
            <ImageCard
              hideSourceBadge
              key={image.id}
              imageData={image}
              className={cn(
                image.isLargeImage && "md:col-span-2 md:row-span-2",
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}
