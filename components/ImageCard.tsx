import { cn } from "./utils.ts";
import type { ImageData } from "../utils/imageSearcher.ts";

export default function ImageCard(props: {
  imageData: ImageData;
  className?: string;
}) {
  const image = props.imageData;
  return (
    <a
      href={`/images/${image.id}`}
      className={cn(props.className, "relative aspect-square")}
    >
      <img
        className="w-full h-full absolute inset-0"
        src={image.blurhashUrl}
        alt="Blurred loading image"
        aria-hidden="true"
      />
      <picture>
        <source
          type="image/webp"
          srcset={`${image.webp["320"]} 320w, ${image.webp["640"]} 640w, ${
            image.webp["1280"]
          } 1280w`}
          sizes="(max-width: 600px) 100vw, (max-width: 960px) 50vw, 33vw"
        />
        <source
          type="image/jpeg"
          srcset={`${image.jpeg["320"]} 320w, ${image.jpeg["640"]} 640w, ${
            image.jpeg["1280"]
          } 1280w`}
          sizes="(max-width: 600px) 100vw, (max-width: 960px) 50vw, 33vw"
        />
        <img
          className="w-full h-full absolute inset-0"
          src={image.jpeg["320"]}
          alt="audiobook cover image"
        />
      </picture>
    </a>
  );
}
