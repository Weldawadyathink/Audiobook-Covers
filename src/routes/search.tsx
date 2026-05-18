import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { z } from "zod/v4";
import { zodValidator } from "@tanstack/zod-adapter";
import ImageCard from "@/components/ImageCard";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getIsAuthenticated } from "@/server/auth";
import { coverSearch } from "@/server/imageSearcher";

const searchParameters = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  showScore: z.boolean().optional(),
});

export const Route = createFileRoute("/search")({
  component: RouteComponent,
  validateSearch: zodValidator(searchParameters),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ deps: data }) => {
    const [auth, images] = await Promise.all([
      getIsAuthenticated(),
      coverSearch({
        data: {
          title: data.search.title,
          author: data.search.author,
        },
      }),
    ]);
    return {
      query: data.search,
      images,
      isAuthenticated: auth.isAuthenticated,
    };
  },
});

function RouteComponent() {
  const { query, images, isAuthenticated } = Route.useLoaderData();
  const navigate = useNavigate();
  const [titleQuery, setTitleQuery] = useState(query.title);
  const [authorQuery, setAuthorQuery] = useState(query.author);
  const [showScore, setShowScore] = useState(query.showScore);

  const submitForm = () => {
    navigate({
      to: "/search",
      search: {
        title: titleQuery,
        author: authorQuery,
        showScore,
      },
    });
  };

  return (
    <>
      <form
        className="flex flex-col gap-3 mx-36"
        onSubmit={(e) => {
          e.preventDefault();
          submitForm();
        }}
      >
        <div className="flex gap-6">
          <div>
            <Input
              type="text border rounded-lg px-2 py-1"
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.target.value)}
            />
          </div>

          <div>
            <Input
              type="text border rounded-lg px-2 py-1"
              value={authorQuery}
              onChange={(e) => setAuthorQuery(e.target.value)}
            />
          </div>

          <Button type="submit">Search</Button>
        </div>
      </form>
      {images.length === 0 && <div>No images found</div>}
      <div className="grid md:grid-cols-4 justify-center gap-6 sm:grid-cols-2 mx-6 my-6">
        {images.map((image) => (
          <ImageCard
            showScore={showScore}
            showDataset={isAuthenticated}
            key={image.id}
            imageData={image}
            className="max-w-96"
          />
        ))}
      </div>
      <Outlet />
    </>
  );
}
