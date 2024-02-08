import { query } from "./db";
import Axios from "axios";

export const reindex = async () => {
  console.log("Starting embedding reindex");
  const results = await query(
    `
    SELECT id
    FROM image
    WHERE
      embedding IS NULL
      AND NOT index_error
  `,
    []
  );
  await Promise.all(results.rows.map((row) => indexItem(row.id)));
  console.log("Completed embedding index");
};

const indexItem = async (id: string) => {
  console.log(`Indexing item id ${id}`);
  const image_url = `https://download.audiobookcovers.com/png/1000/${id}.png`;
  const clip_base_url = process.env.CLIP_API_URL || "http://localhost:8080";
  const clip_url = `${clip_base_url}/embedding/image/url?url=${encodeURIComponent(
    image_url
  )}`;
  const embeddingInsertQuery = `
  UPDATE image
  SET embedding = $1::vector
  WHERE id = $2
  `;
  const indexErrorQuery = `
  UPDATE image
  SET index_error = true
  WHERE id = $1
  `;
  return Axios.get(clip_url)
    .then((result) => JSON.stringify(result.data))
    .then((embedding) => {
      query(embeddingInsertQuery, [embedding, id]);
    })
    .catch(() => query(indexErrorQuery, [id]));
};
