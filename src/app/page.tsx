import { HydrateClient } from "@/trpc/server";
import { RandomView } from "@/components/RandomView";

export default async function Home() {
  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center justify-center text-white">
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
            Find Audiobook Artwork
          </h1>

          <RandomView />
        </div>
      </main>
    </HydrateClient>
  );
}
