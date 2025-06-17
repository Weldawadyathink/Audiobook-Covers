import { createFileRoute } from "@tanstack/react-router";
import { getImageByIdAndSimilar } from "@/server/imageSearcher";
import ImageCard from "@/components/ImageCard";

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

  if (!image) {
    return <div>Image not found</div>;
  }

  return (
    <div className="grid">
      <ImageCard imageData={image} className="max-w-96" />
      {auth && (
        <div className="my-6 max-w-96">
          <span>{image.searchable}</span>
          <span>{image.from_old_database}</span>
        </div>
      )}

      {similar && (
        <div className="grid grid-cols-4 gap-4">
          {similar.map((image) => (
            <ImageCard
              key={image.id}
              imageData={image}
              showDistance={auth}
              showDataset={auth}
            />
          ))}
        </div>
      )}
    </div>
  );
}
