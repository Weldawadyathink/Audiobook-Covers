import { define } from "../utils.ts";
import { getTextEmbedding } from "../server/clip.ts";

export default define.page(async () => {
  const data = await getTextEmbedding("hi there", "mobileclip");
  return <code>{JSON.stringify(data)}</code>;
});
