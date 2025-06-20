import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <form method="post" action="/api/login" style={{ maxWidth: 300 }}>
      <h2>Admin Login</h2>
      <div>
        <label>Username</label>
        <Input name="username" type="text" required />
      </div>
      <div>
        <label>Password</label>
        <Input name="password" type="password" required />
      </div>
      <Button type="submit">Log In</Button>
    </form>
  );
}
