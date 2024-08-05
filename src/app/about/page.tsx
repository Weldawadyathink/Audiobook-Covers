import Link from "next/link";

export default function Page() {
  return (
    <div className="m-12 max-w-prose">
      <h1 className="-ml-6 mb-2 mt-6 text-xl font-semibold">The Inspiration</h1>
      <p className="my-2">
        I love searching{" "}
        <Link href="https://reddit.com/r/audiobookcovers">
          /r/audiobookcovers
        </Link>{" "}
        for custom artwork for my audiobooks, but reddit's search is notoriously
        bad. I wanted a way to search for and download new artwork quickly and
        easily, without worrying about different image hosts, getting the
        highest image quality, or reddit's interface. This started out as a
        personal project to archive the subreddit, but quickly grew into a
        website to contribute back to the community.
      </p>
      <p className="my-2">
        I have redesigned this website numerous times. It serves as a benchmark
        for my personal skill growth in web development. I have made many
        mistakes along the way, but I am now happy with the project as it
        currently stands. I hope that you enjoy using this website.
      </p>

      <h1 className="-ml-6 mb-2 mt-6 text-xl font-semibold">The Technology</h1>
      <ul>
        <li>T3 stack</li>
        <li>Next.js</li>
        <li>Typescript</li>
        <li>tRPC</li>
        <li>OpenAI CLIP</li>
        <li>Replicate</li>
        <li>Supabase</li>
      </ul>
    </div>
  );
}
