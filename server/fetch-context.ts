import { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";

export function createContext({ req }: FetchCreateContextFnOptions) {
  //   const user = { name: req.headers.get("username") ?? "anonymous" };
  //   return { req, user };
  return { req };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
