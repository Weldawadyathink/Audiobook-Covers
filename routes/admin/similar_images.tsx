import { define } from "../../utils.ts";
import { getDbPool, sql } from "../../server/db.ts";
import { shapeImageData } from "../../server/imageData.ts";
import { DBImageDataValidator } from "../../server/imageData.ts";
import { env } from "../../env.ts";
import { z } from "zod/v4";
import { getIsAuthenticated } from "../../server/auth.ts";
import ImageCard from "../../islands/ImageCard.tsx";

export default define.page(async (props) => {
  if (!(await getIsAuthenticated(props.req))) {
    return <p>Not authenticated</p>;
  }
  console.log(
    "ADMIN: Getting similar images from database, long running query.",
  );
  const pool = await getDbPool();
  const rawImages = await pool.many(
    sql.type(
      z.object({
        distance: z.number(),
        image1: DBImageDataValidator,
        image2: DBImageDataValidator,
      }),
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
        JOIN image i1 ON i1.id = n.id1
        JOIN image i2 ON i2.id = n.id2
      ORDER BY n.distance
      LIMIT 24
    `,
  );

  const images = await Promise.all(rawImages.map(async (pair) => {
    return {
      image1: await shapeImageData(pair.image1),
      image2: await shapeImageData(pair.image2),
      distance: pair.distance,
    };
  }));

  return (
    <div class="grid grid-cols-1 gap-16">
      {images.map((pair, index) => (
        <div key={index} class="grid grid-cols-3 gap-4">
          <ImageCard class="max-w-64" imageData={pair.image1} showDataset />
          <span>{pair.distance}</span>
          <ImageCard class="max-w-64" imageData={pair.image2} showDataset />
        </div>
      ))}
    </div>
  );
});
