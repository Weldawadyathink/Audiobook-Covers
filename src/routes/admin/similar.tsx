import { createFileRoute } from "@tanstack/react-router";
import ImageCard from "@/components/ImageCard";
import { createServerFn } from "@tanstack/react-start";
import { getDbPool, sql } from "@/server/db";
import { z } from "zod/v4";
import { toast, Toaster } from "sonner";
import { DBImageDataValidator, shapeImageData } from "@/server/imageData";
import { setImageDeleted, setImageNotDeleted } from "@/server/crud";

const getSimilarImagePairs = createServerFn().handler(async () => {
  console.log("ADMIN: Getting similar images from database.");
  const pool = await getDbPool();
  const rawImages = await pool.many(
    sql.type(
      z.object({
        distance: z.number(),
        image1: DBImageDataValidator,
        image2: DBImageDataValidator,
      })
    )`
      SELECT
        jsonb_build_object(
          'id',                i1.id,
          'source',            i1.source,
          'extension',         i1.extension,
          'blurhash',          i1.blurhash,
          'searchable',        i1.searchable,
          'from_old_database', i1.from_old_database
        ) AS image1,
        jsonb_build_object(
          'id',                i2.id,
          'source',            i2.source,
          'extension',         i2.extension,
          'blurhash',          i2.blurhash,
          'searchable',        i2.searchable,
          'from_old_database', i2.from_old_database
        ) AS image2,
        n.distance
      FROM image_neighbor n
        JOIN image i1 ON i1.id = n.id1 AND i1.deleted IS FALSE AND i1.searchable IS TRUE
        JOIN image i2 ON i2.id = n.id2 AND i2.deleted IS FALSE AND i2.searchable IS TRUE
      ORDER BY n.distance
      LIMIT 48
    `
  );

  const images = await Promise.all(
    rawImages.map(async (pair) => {
      return {
        image1: await shapeImageData(pair.image1),
        image2: await shapeImageData(pair.image2),
        distance: pair.distance,
      };
    })
  );

  return images;
});

export const Route = createFileRoute("/admin/similar")({
  component: RouteComponent,
  loader: async () => {
    return {
      pairs: await getSimilarImagePairs(),
    };
  },
});

function RouteComponent() {
  const { pairs } = Route.useLoaderData();

  const handleDelete = async (id: string) => {
    try {
      await setImageDeleted({ data: { id } });
      toast("Image deleted", {
        action: {
          label: "Undo",
          onClick: () => handleUndo(id),
        },
        description: "Refresh the page to see changes.",
      });
    } catch (error: any) {
      toast("Failed to delete image", { description: error.message });
    }
  };

  const handleUndo = async (id: string) => {
    try {
      await setImageNotDeleted({ data: { id } });
      toast("Image restored");
    } catch (error: any) {
      toast("Failed to restore image", { description: error.message });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-16 p-8">
      {pairs.map((pair, index) => (
        <div key={index} className="grid grid-cols-3 gap-4 items-center">
          <div className="flex flex-col items-center">
            <ImageCard
              className="w-64 max-w-64"
              imageData={pair.image1}
              showDataset
            />
            <a href={pair.image1.source} target="_blank">
              {pair.image1.source}
            </a>
            <button
              className="mt-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
              onClick={() => handleDelete(pair.image1.id)}
            >
              Delete
            </button>
          </div>
          <span className="text-center font-mono text-lg">
            {pair.distance.toFixed(4)}
          </span>
          <div className="flex flex-col items-center">
            <ImageCard
              className="w-64 max-w-64"
              imageData={pair.image2}
              showDataset
            />
            <a href={pair.image2.source} target="_blank">
              {pair.image2.source}
            </a>
            <button
              className="mt-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
              onClick={() => handleDelete(pair.image2.id)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
      <Toaster />
    </div>
  );
}
