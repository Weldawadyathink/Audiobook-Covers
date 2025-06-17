import { cn } from "@/lib/utils";
import { useEffect, useState, useRef, type CSSProperties } from "react";
import { type ImageData } from "@/server/imageData";

export default function ImageCard(props: {
  imageData: ImageData;
  className?: string;
  class?: string;
  showDistance?: boolean;
  showDataset?: boolean;
}) {
  const image = props.imageData;
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // Check if the image is already loaded (e.g., from cache)
    if (imgRef.current && imgRef.current.complete) {
      setIsLoaded(true);
    }
  }, []);

  const style: CSSProperties = {
    boxShadow: `0 0 20px hsla(${image.primaryColor.hue}, ${image.primaryColor.saturation}%, ${
      image.primaryColor.lightness * 0.6
    }%, 0.5)`,
  };

  return (
    <a
      href={`/images/${image.id}`}
      style={style}
      className={cn(
        props.className,
        props.class,
        "relative aspect-square cursor-pointer rounded-3xl overflow-hidden duration-500 ease-in-out hover:z-10",
      )}
    >
      {"distance" in image && props.showDistance && (
        <span className="absolute top-2 right-2 z-10 bg-black bg-opacity-50 text-white text-xs font-semibold px-2 py-1 rounded-full">
          {image.distance!.toFixed(3)}
        </span>
      )}
      {"from_old_database" in image && props.showDataset && (
        <span className="absolute bottom-2 right-2 z-10 bg-black bg-opacity-50 text-white text-xs font-semibold px-2 py-1 rounded-full">
          {image.from_old_database ? "Old dataset" : "New dataset"}
        </span>
      )}
      <img
        className="w-full h-full absolute inset-0"
        src={image.blurhashUrl}
        alt="Blurred loading image"
        aria-hidden="true"
      />
      <picture>
        <source
          type="image/webp"
          srcSet={`${image.webp["320"]} 320w, ${image.webp["640"]} 640w, ${
            image.webp["1280"]
          } 1280w`}
          sizes="(max-width: 600px) 100vw, (max-width: 960px) 50vw, 33vw"
        />
        <source
          type="image/jpeg"
          srcSet={`${image.jpeg["320"]} 320w, ${image.jpeg["640"]} 640w, ${
            image.jpeg["1280"]
          } 1280w`}
          sizes="(max-width: 600px) 100vw, (max-width: 960px) 50vw, 33vw"
        />
        <img
          ref={imgRef} // Attach the ref
          alt="audiobook cover image"
          loading="lazy"
          className={cn(
            "w-full h-full absolute inset-0 duration-500 ease-in-out",
            isLoaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setIsLoaded(true)}
          src={image.jpeg["320"]}
        />
      </picture>
    </a>
  );
}
