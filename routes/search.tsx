import { define } from "../utils.ts";
import ImageCard from "../islands/ImageCard.tsx";
import { vectorSearchByString } from "../server/imageSearcher.ts";
import { modelOptions, zModelOptions } from "../server/models.ts";
import { getIsAuthenticated } from "../server/auth.ts";

export default define.page(async (props) => {
  const query = props.url.searchParams.get("q");
  const model = zModelOptions.parse(props.url.searchParams.get(
    "model",
  ));
  const auth = await getIsAuthenticated(props.req);

  const results = query ? await vectorSearchByString(query, model) : [];
  return (
    <>
      <form method="GET" action="/search" className="flex flex-row gap-6 mx-12">
        <input type="text" name="q" value={query || ""} />
        <select name="model" id="model">
          {modelOptions.map((option) => (
            <option key={option} value={option} selected={option == model}>
              {option}
            </option>
          ))}
        </select>
        <button type="submit">Search</button>
      </form>
      <div className="grid md:grid-cols-4 justify-center gap-6 sm:grid-cols-2 mx-6 my-6">
        {results.map((image) => (
          <>
            <ImageCard
              showDistance={auth}
              key={image.id}
              imageData={image}
              className="max-w-96"
            />
          </>
        ))}
      </div>
    </>
  );
});
