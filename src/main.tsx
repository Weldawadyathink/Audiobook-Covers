import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { TRPCReactProvider } from "./utils/trpc.tsx";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.ts";

const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TRPCReactProvider>
      <RouterProvider router={router} />
    </TRPCReactProvider>
  </StrictMode>,
);
