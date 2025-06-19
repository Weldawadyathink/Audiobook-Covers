import { createFileRoute, useRouter } from "@tanstack/react-router";
import { getImageByIdAndSimilar } from "@/server/imageSearcher";
import ImageCard from "@/components/ImageCard";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { saveAs } from "file-saver";
import { Download, ExternalLink, SearchCheck, SearchX } from "lucide-react";
import { setImageNotSearchable, setImageSearchable } from "@/server/crud";
import { toast, Toaster } from "sonner";
import { getIsAuthenticated } from "@/server/auth";

export const Route = createFileRoute("/images/$id")({
  component: RouteComponent,
  loader: async ({ params }) => {
    return {
      images: await getImageByIdAndSimilar({ data: params.id }),
      auth: await getIsAuthenticated(),
    };
  },
});

function RouteComponent() {
  const {
    images: [image, ...similar],
    auth,
  } = Route.useLoaderData();
  const [downloading, setDownloading] = useState(false);
  const router = useRouter();

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

  function toggleSearchable() {
    if (image.searchable) {
      toast("Image set as not searchable");
      setImageNotSearchable({ data: { id: image.id } }).then(() =>
        router.invalidate()
      );
    } else {
      toast("Image set as searchable");
      setImageSearchable({ data: { id: image.id } }).then(() =>
        router.invalidate()
      );
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
          <Button
            className="w-full"
            onClick={handleDownload}
            disabled={downloading}
          >
            <span>{downloading ? "Downloading..." : "Download"}</span>
            <Download />
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
      <Toaster />
    </div>
  );
}
