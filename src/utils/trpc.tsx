import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../server/router.ts";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";

export const api = createTRPCReact<AppRouter>();

let clientQueryClientSingleton: QueryClient | undefined = undefined;
const getQueryClient = () => {
  return (clientQueryClientSingleton ??= new QueryClient());
};

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        httpBatchLink({
          url: "/trpc",
        }),
      ],
    })
  );

  // Deno throws a fit about queryClient type, but it is functional anyway
  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient as any}>
        {props.children}
      </api.Provider>
    </QueryClientProvider>
  );
}
