import { createFileRoute } from "@tanstack/react-router";
import { api } from "../utils/trpc.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { ImageCard } from "../components/ImageCard.tsx";
import { cn } from "../utils/utils.ts";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const images = api.cover.getRandom.useQuery();

  return (
    <>
      {images.isLoading && <Spinner />}
      {images.isSuccess && (
        <div className="grid grid-cols-3 justify-center gap-6 p-12">
          {images.data.length === 0 && <p>Could not find any results</p>}
          {images.data.map((image, index) => (
            <ImageCard
              hideSourceBadge
              key={image.id}
              imageData={image}
              className={cn(
                ((index % 6) == 1 || (index % 6) == 3) &&
                  "col-span-2 row-span-2",
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}
