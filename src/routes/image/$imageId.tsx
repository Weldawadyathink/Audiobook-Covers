import { createFileRoute } from "@tanstack/react-router";
import useDownloader from "react-use-downloader";
import { api } from "../../utils/trpc.tsx";
import { Spinner } from "../../components/Spinner.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { Link } from "@tanstack/react-router";
import Tilt from "react-parallax-tilt";
import { useState } from "react";
import { BlurhashCanvas } from "react-blurhash";

export const Route = createFileRoute("/image/$imageId")({
  component: RouteComponent,
});

function RouteComponent() {
  const maxAngle = 2;
  const { imageId } = Route.useParams();
  const { download } = useDownloader();
  const [isLoaded, setIsLoaded] = useState(false);
  const image = api.cover.getById.useQuery(imageId);
  return (
    <>
      {image.status === "pending" && <Spinner />}
      {image.status === "error" && (
        <p>Could not find image with id: {imageId}</p>
      )}
      {image.status === "success" && (
        <>
          <div className="flex flex-row justify-center gap-6">
            <Button
              onClick={() =>
                download(image.data.url, image.data.url.split("/").pop()!)}
            >
              Download
            </Button>
            <Button asChild>
              <Link to={image.data.source}>Source</Link>
            </Button>
          </div>
          <Tilt tiltMaxAngleX={maxAngle} tiltMaxAngleY={maxAngle}>
            <div className="relative m-8 aspect-square overflow-hidden rounded-3xl">
              {!isLoaded && (
                <BlurhashCanvas
                  className="h-full w-full"
                  hash={image.data.blurhash}
                />
              )}
              <img
                src={image.data.url}
                alt="Audiobook cover image"
                onLoad={() => setIsLoaded(true)}
                style={{ display: isLoaded ? "block" : "none" }}
              />
            </div>
          </Tilt>
        </>
      )}
    </>
  );
}
