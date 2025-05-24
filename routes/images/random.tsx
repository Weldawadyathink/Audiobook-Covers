import { define } from "../../utils.ts";
import ImageCard from "../../components/ImageCard.tsx";
import { getRandom } from "../../utils/imageSearcher.ts";

export default define.page(async () => {
  const images = await getRandom();
  return (
    <div className="grid md:grid-cols-3 justify-center gap-6 sm:grid-cols-2 mx-6 my-6">
      {images.map((image) => (
        <ImageCard key={image.id} imageData={image} className="max-w-96" />
      ))}
    </div>
  );
});
