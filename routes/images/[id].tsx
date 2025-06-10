import { define } from "../../utils.ts";
import ImageCard from "../../islands/ImageCard.tsx";
import { getImageById } from "../../server/imageSearcher.ts";

export default define.page(async (props) => {
  props.params.id;

  const image = await getImageById(props.params.id);

  if (!image) {
    return <p>Image id {props.params.id} could not be found.</p>;
  }

  return (
    <div className="grid">
      <ImageCard imageData={image} className="max-w-96" />
    </div>
  );
});
