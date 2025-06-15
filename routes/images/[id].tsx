import { define } from "../../utils.ts";
import ImageCard from "../../islands/ImageCard.tsx";
import { getImageById } from "../../server/imageSearcher.ts";
import { getIsAuthenticated } from "../../server/auth.ts";

export default define.page(async (props) => {
  const auth = await getIsAuthenticated(props.req);
  const image = await getImageById(props.params.id);
  console.log(image);

  if (!image) {
    return <p>Image id {props.params.id} could not be found.</p>;
  }

  return (
    <div className="grid">
      <ImageCard imageData={image} className="max-w-96" />
      {auth && (
        <>
          {image.searchable
            ? <span>Searchable</span>
            : <span>Not searchable</span>}
        </>
      )}
    </div>
  );
});
