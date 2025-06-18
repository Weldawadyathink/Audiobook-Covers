import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/test")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-col gap-18">
      <div>Hello "/admin/test"!</div>
      <div className="flex flex-row gap-2">
        <Button variant="default" size="lg">
          Default
        </Button>
        <Button variant="default">Default</Button>
        <Button variant="default" size="sm">
          Default
        </Button>
      </div>

      <div className="flex flex-row gap-2">
        <Button variant="destructive" size="lg">
          Destructive
        </Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="destructive" size="sm">
          Destructive
        </Button>
      </div>

      <div className="flex flex-row gap-2">
        <Button variant="secondary" size="lg">
          Secondary
        </Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="secondary" size="sm">
          Secondary
        </Button>
      </div>

      <div className="flex flex-row gap-2">
        <Button variant="outline" size="lg">
          Outline
        </Button>
        <Button variant="outline">Outline</Button>
        <Button variant="outline" size="sm">
          Outline
        </Button>
      </div>

      <div className="flex flex-row gap-2">
        <Button variant="ghost" size="lg">
          Ghost
        </Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="ghost" size="sm">
          Ghost
        </Button>
      </div>

      <div className="flex flex-row gap-2">
        <Button variant="link" size="lg">
          Link
        </Button>
      </div>
    </div>
  );
}
