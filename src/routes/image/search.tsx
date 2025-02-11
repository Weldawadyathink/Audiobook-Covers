import { createFileRoute } from "@tanstack/react-router";
import { Input } from "../../components/ui/Input.tsx";
import { Button } from "../../components/ui/Button.tsx";

export const Route = createFileRoute("/image/search")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <Input></Input>
      <Button>Search</Button>
    </div>
  );
}
