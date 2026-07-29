import { cn } from "@/lib/utils";
import { useEffect, useState, useRef, type CSSProperties } from "react";
import { type ImageData } from "@/server/imageData";

export default function ImageCard(props: {
  imageData: ImageData;
  className?: string;
  class?: string;
  showScore?: boolean;
  /** Caption the cover with its matched book on hover/focus. */
  showBook?: boolean;
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

  const book = props.showBook ? image.openlibrary : undefined;
  const bookTitle =
    book && [book.title, book.subtitle].filter(Boolean).join(": ");
  const bookAuthors = book?.authorNames.filter(Boolean).join(", ");

  return (
    <a
      href={`/images/${image.id}`}
      style={style}
      className={cn(
        props.className,
        props.class,
        "group relative aspect-square cursor-pointer overflow-hidden rounded-3xl outline-none transition-transform duration-500 ease-in-out hover:z-10 hover:scale-[1.02] focus-visible:z-10 focus-visible:scale-[1.02] focus-visible:ring-2 focus-visible:ring-cyan-200/70",
      )}
    >
      {"score" in image && props.showScore && (
        <span className="absolute top-2 right-2 z-10 rounded-full bg-slate-950/70 px-2 py-1 text-xs font-semibold text-white backdrop-blur">
          {image.score!.toFixed(3)}
        </span>
      )}
      <img
        className="absolute inset-0 h-full w-full"
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
            "absolute inset-0 h-full w-full duration-500 ease-in-out",
            isLoaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setIsLoaded(true)}
          src={image.jpeg["320"]}
        />
      </picture>
      {bookTitle && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-linear-to-t from-slate-950/95 via-slate-950/70 to-transparent px-4 pt-10 pb-4 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">
            {bookTitle}
          </p>
          {bookAuthors && (
            <p className="mt-0.5 line-clamp-1 text-xs text-slate-300">
              {bookAuthors}
            </p>
          )}
        </div>
      )}
    </a>
  );
}
