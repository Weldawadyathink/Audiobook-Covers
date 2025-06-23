import { createFileRoute } from "@tanstack/react-router";
import { getRandom } from "@/server/imageSearcher";
import ImageCard from "@/components/ImageCard";
import { cn } from "@/lib/utils";
import { getIsAuthenticated } from "@/server/auth";

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
    isMd && "md:max-lg:col-span-3 md:max-lg:row-span-3 md:max-lg:scale-95",
    isLg && "lg:col-span-2 lg:row-span-2 lg:scale-95"
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
    <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-3 lg:grid-cols-4 justify-center gap-6 mx-6 my-6">
      {images.map((image, index) => (
        <ImageCard
          key={image.id}
          imageData={image}
          showDataset={auth.isAuthenticated}
          className={getLargeImageClass(index)}
        />
      ))}
    </div>
  );
}
