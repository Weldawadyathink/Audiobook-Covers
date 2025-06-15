import { define } from "../utils.ts";
import ImageCard from "../islands/ImageCard.tsx";
import { getRandom } from "../server/imageSearcher.ts";
import { cn } from "../components/utils.ts";
import { getIsAuthenticated } from "../server/auth.ts";

function isLargeImage(index: number) {
  const repeatInterval = 15; // Pattern repeats every 15 numbers
  const select = new Set([1, 9, 10]); // Select large images by modulus
  return select.has(index % repeatInterval);
}

export default define.page(async (props) => {
  const auth = await getIsAuthenticated(props.req);
  const images = await getRandom();
  return (
    <div className="grid md:grid-cols-4 justify-center gap-6 sm:grid-cols-2 mx-6 my-6">
      {images.map((image, index) => (
        <ImageCard
          key={image.id}
          imageData={image}
          showDataset={auth}
          className={cn(
            "",
            isLargeImage(index) &&
              "col-span-2 row-span-2 scale-95",
          )}
        />
      ))}
    </div>
  );
});
