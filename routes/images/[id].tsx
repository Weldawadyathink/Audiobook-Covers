import { define } from "../../utils.ts";
import ImageCard from "../../islands/ImageCard.tsx";
import { getImageById } from "../../server/imageSearcher.ts";
import { getIsAuthenticated } from "../../server/auth.ts";

export default define.page(async (props) => {
  const auth = await getIsAuthenticated(props.req);
  const image = await getImageById(props.params.id);

  if (!image) {
    return <p>Image id {props.params.id} could not be found.</p>;
  }

  if (!("searchable" in image)) {
    console.error("Image does not have searchable field");
    return new Response("Internal server error", { status: 500 });
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
    </div>
  );
});
