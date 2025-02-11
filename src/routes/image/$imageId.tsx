import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/image/$imageId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { imageId } = Route.useParams();
  return <div>Hello "/image/@imageId"! Image ID: {imageId}</div>;
}
