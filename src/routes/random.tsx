import { createFileRoute } from "@tanstack/react-router";
import { getRandom } from "@/server/imageSearcher";
import ImageCard from "@/components/ImageCard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/random")({
  component: RouteComponent,
  loader: async () => {
    return {
      images: await getRandom(),
      isLoggedIn: true,
    };
  },
});

function isLargeImage(index: number) {
  const repeatInterval = 15; // Pattern repeats every 15 numbers
  const select = new Set([1, 9, 10]); // Select large images by modulus
  return select.has(index % repeatInterval);
}

function RouteComponent() {
  const { images, isLoggedIn } = Route.useLoaderData();
  return (
    <>
      <div className="grid md:grid-cols-4 justify-center gap-6 sm:grid-cols-2 mx-6 my-6">
        {images.map((image, index) => (
          <ImageCard
            key={image.id}
            imageData={image}
            showDataset={isLoggedIn}
            className={cn(
              "",
              isLargeImage(index) && "col-span-2 row-span-2 scale-95",
            )}
          />
        ))}
      </div>
    </>
  );
}
