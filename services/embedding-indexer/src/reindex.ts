import { query } from "./db";

export const reindex = async () => {
  const results = await query(
    `
    SELECT id 
    FROM image 
    WHERE embedding IS NULL
  `,
    []
  );
  results.rows.map((row) => indexItem(row.id));
};

const indexItem = async (id: string) => {
  console.log(`Indexing item id ${id}`)
}
