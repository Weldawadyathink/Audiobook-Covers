import { createFileRoute } from "@tanstack/react-router";
import { Input } from "../../components/ui/Input.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { api } from "../../utils/trpc.tsx";

export const Route = createFileRoute("/image/search")({
  component: RouteComponent,
});

function RouteComponent() {
  const data = api.cover.vectorSearchWithString.useQuery({
    modelName: "Benny1923/metaclip-b16-fullcc2.5b",
    queryString: "Hello world!",
  });
  return (
    <div>
      <Input></Input>
      <Button>Search</Button>
      <p>{JSON.stringify(data.data)}</p>
    </div>
  );
}
