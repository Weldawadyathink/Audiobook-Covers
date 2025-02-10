import { createFileRoute } from "@tanstack/react-router";
import { api } from "../utils/trpc.tsx";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const query = api.greeting.useQuery();

  return (
    <div className="p-2">
      <h3>Welcome Home!</h3>
      <p>Query result: {query.data}</p>
    </div>
  );
}
