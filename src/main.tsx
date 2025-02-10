import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { TRPCReactProvider } from "./utils/trpc.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TRPCReactProvider>
      <App />
    </TRPCReactProvider>
  </StrictMode>,
);
