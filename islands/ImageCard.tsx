import { cn } from "../components/utils.ts";
import { useState } from "preact/hooks";
import { JSX } from "preact";
import { ImageData } from "../utils/imageData.ts";

export default function ImageCard(props: {
  imageData: ImageData;
  className?: string;
}) {
  const image = props.imageData;
  const [isLoaded, setIsLoaded] = useState(false);
  const style: JSX.CSSProperties = {
    boxShadow:
      `0 0 20px hsla(${image.primaryColor.hue}, ${image.primaryColor.saturation}%, ${
        image.primaryColor.lightness * 0.6
      }%, 0.5)`,
  };
  return (
    <a
      href={`/images/${image.id}`}
      style={style}
      className={cn(
        props.className,
        "relative aspect-square cursor-pointer rounded-3xl overflow-hidden hover:scale-105 duration-500 ease-in-out hover:z-10",
      )}
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
          alt="audiobook cover image"
          loading="lazy"
          className={cn(
            "w-full h-full absolute inset-0 duration-500 ease-in-out",
            isLoaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setIsLoaded(true)}
          src={image.jpeg["320"]}
          // alt="audiobook cover image" // Not technically accessible, but this site is image focused anyway
        />
      </picture>
    </a>
  );
}
