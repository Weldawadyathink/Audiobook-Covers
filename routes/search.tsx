import { define } from "../utils.ts";
import ImageCard from "../islands/ImageCard.tsx";
import { vectorSearchByString } from "../server/imageSearcher.ts";

export default define.page(async (props) => {
  const query = props.url.searchParams.get("q");
  const results = query ? await vectorSearchByString(query) : [];
  return (
    <>
      <form method="GET" action="/search">
        <input type="text" name="q" defaultValue={query || ""} />
        <button type="submit">Search</button>
      </form>
      <span>Results</span>
      <div className="grid md:grid-cols-3 justify-center gap-6 sm:grid-cols-2 mx-6 my-6">
        {results.map((image) => (
          <ImageCard key={image.id} imageData={image} className="max-w-96" />
        ))}
      </div>
    </>
  );
});
