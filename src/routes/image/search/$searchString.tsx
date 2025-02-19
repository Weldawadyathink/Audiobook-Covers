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
    { enabled: () => searchString.length > 0 },
  );

  const metaclip = api.cover.vectorSearchWithString.useQuery(
    {
      modelName: "Benny1923/metaclip-b16-fullcc2.5b",
      queryString: searchString,
    },
    { enabled: () => true },
  );

  const openAI = api.cover.vectorSearchWithString.useQuery(
    {
      modelName: "Xenova/clip-vit-large-patch14",
      queryString: searchString,
    },
    { enabled: () => true },
  );

  const mobileclip = api.cover.vectorSearchWithString.useQuery(
    {
      modelName: "Xenova/mobileclip_blt",
      queryString: searchString,
    },
    { enabled: () => true },
  );

  return (
    <div className="flex flex-row gap-6">
      <div className="flex flex-col gap-6">
        <span>Metaclip</span>
        {metaclip.isSuccess &&
          metaclip.data.map((image) => (
            <ImageCard key={image.id} imageData={image} className="w-56" />
          ))}
      </div>
      <div className="flex flex-col gap-6">
        <span>OpenAI</span>
        {openAI.isSuccess &&
          openAI.data.map((image) => (
            <ImageCard key={image.id} imageData={image} className="w-56" />
          ))}
      </div>
      <div className="flex flex-col gap-6">
        <span>Mobileclip</span>
        {mobileclip.isSuccess &&
          mobileclip.data.map((image) => (
            <ImageCard key={image.id} imageData={image} className="w-56" />
          ))}
      </div>
    </div>
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
