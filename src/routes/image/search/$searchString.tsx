import { createFileRoute } from "@tanstack/react-router";
import { api } from "../../../utils/trpc.tsx";
import { Spinner } from "../../../components/Spinner.tsx";
import { ImageCard } from "../../../components/ImageCard.tsx";

export const Route = createFileRoute("/image/search/$searchString")({
  component: RouteComponent,
});

function RouteComponent() {
  const { searchString } = Route.useParams();

  const images = api.cover.vectorSearchWithString.useQuery(
    {
      modelName: "Benny1923/metaclip-b16-fullcc2.5b",
      queryString: searchString,
    },
    {
      enabled: () => searchString !== "",
    },
  );

  return (
    <>
      {images.isLoading && <Spinner />}
      {images.isSuccess && (
        <div className="flex flex-wrap justify-center gap-6 p-12">
          {images.data.length === 0 && <p>Could not find any results</p>}
          {images.data.map((image) => (
            <ImageCard key={image.id} imageData={image} className="w-56" />
          ))}
        </div>
      )}
    </>
  );
}
