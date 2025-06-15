import { define } from "../../utils.ts";
import ImageCard from "../../islands/ImageCard.tsx";
import {
  getImageById,
  getImageByIdAndSimilar,
} from "../../server/imageSearcher.ts";
import { getIsAuthenticated } from "../../server/auth.ts";

export default define.page(async (props) => {
  console.log(await getImageById(props.params.id));
  const auth = await getIsAuthenticated(props.req);
  const [image, ...similar] = await getImageByIdAndSimilar(props.params.id);

  if (!image) {
    return <p>Image id {props.params.id} could not be found.</p>;
  }

  return (
    <div className="grid">
      <ImageCard imageData={image} className="max-w-96" />
      {auth && (
        <div class="my-6 max-w-96">
          <form
            action={`/api/images/${props.params.id}/submit`}
            method="POST"
            class="grid grid-cols-2 gap-4"
          >
            <label for="searchable">Searchable</label>
            <select name="searchable" id="searchable">
              <option value="true" selected={image.searchable}>Yes</option>
              <option value="false" selected={!image.searchable}>No</option>
            </select>
            <button type="submit">Submit</button>
          </form>
        </div>
      )}

      {similar && (
        <div class="grid grid-cols-4 gap-4">
          {similar.map((image) => (
            <ImageCard
              key={image.id}
              imageData={image}
              showDistance={auth}
              showDataset={auth}
            />
          ))}
        </div>
      )}
    </div>
  );
});
