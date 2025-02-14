import { createFileRoute } from "@tanstack/react-router";
import { Input } from "../../components/ui/Input.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { api } from "../../utils/trpc.tsx";
import { ImageCard } from "../../components/ImageCard.tsx";

export const Route = createFileRoute("/image/search")({
  component: RouteComponent,
});

function RouteComponent() {
  const covers = api.cover.vectorSearchWithString.useQuery({
    modelName: "Benny1923/metaclip-b16-fullcc2.5b",
    queryString: "Hello world!",
  });
  return (
    <div>
      <Input></Input>
      <Button>Search</Button>
      {covers.isSuccess &&
        covers.data.map((item) => (
          <ImageCard imageData={item} className="max-w-48 max-h-48" />
        ))}
    </div>
  );
}
