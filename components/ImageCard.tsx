import { cn } from "./utils.ts";
import type { ImageData } from "../utils/imageSearcher.ts";

export default function ImageCard(props: {
  imageData: ImageData;
  className?: string;
}) {
  return (
    <a
      href={`/images/${props.imageData.id}`}
      className={cn(props.className, "relative aspect-square")}
    >
      <img
        className="w-full h-full absolute inset-0"
        src={props.imageData.blurhashUrl}
        alt="Blurred loading image"
        aria-hidden="true"
      />
      <picture className="w-full h-full absolute inset-0">
        <img src={props.imageData.url} alt="audiobook cover image" />
      </picture>
    </a>
  );
}
