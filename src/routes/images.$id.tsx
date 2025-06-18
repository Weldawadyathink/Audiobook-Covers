import { createFileRoute } from "@tanstack/react-router";
import { getImageByIdAndSimilar } from "@/server/imageSearcher";
import ImageCard from "@/components/ImageCard";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { saveAs } from "file-saver";

export const Route = createFileRoute("/images/$id")({
  component: RouteComponent,
  loader: async ({ params }) => {
    return {
      images: await getImageByIdAndSimilar({ data: params.id }),
      auth: true,
    };
  },
});

function RouteComponent() {
  const {
    images: [image, ...similar],
    auth,
  } = Route.useLoaderData();
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      saveAs(blob, image.url.split("/").pop() || "cover");
    } catch (e) {
      alert("Failed to download image.");
    } finally {
      setDownloading(false);
    }
  }

  if (!image) {
    return <div className="text-center text-lg mt-16">Image not found</div>;
  }

  return (
    <div className="flex flex-col items-center w-full px-4 py-8">
      <div className="flex flex-col items-center bg-white/80 rounded-2xl shadow-lg p-6 mb-8 max-w-lg w-full">
        <ImageCard imageData={image} className="max-w-96 w-full mb-4" />
        <div className="flex flex-col items-center gap-2 w-full">
          {auth && (
            <div className="flex flex-row gap-4 text-xs text-gray-600 mb-2">
              <span>Searchable: {String(image.searchable)}</span>
              <span>Dataset: {image.from_old_database ? "Old" : "New"}</span>
            </div>
          )}
          {image.source && (
            <a
              href={image.source}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline text-sm mb-2"
            >
              View Source
            </a>
          )}
          <Button
            className="w-full"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? "Downloading..." : "Download"}
          </Button>
        </div>
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
                showDistance={auth}
                showDataset={auth}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
