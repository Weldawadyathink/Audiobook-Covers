import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <h1>The Inspiration</h1>
      <p>
        I love searching /r/audiobookcovers for custom artwork for my
        audiobooks, but reddit's search is notoriously bad. I wanted a way to
        search for and download new artwork quickly and easily, without worrying
        about different image hosts, getting the highest image quality, or
        reddit's interface. This started out as a personal project to archive
        the subreddit, but quickly grew into a website to contribute back to the
        community. I have redesigned this website numerous times. It serves as a
        benchmark for my personal skill growth in web development. I have made
        many mistakes along the way, but I am now happy with the project as it
        currently stands. I hope that you enjoy using this website.
      </p>
      <h1>The Technology</h1>
      <div></div>
    </div>
  );
}
