import { cn } from "./utils.ts";

export interface ImageData {
  url: string;
  blurhash: string;
}

export default function Cover(props: {
  imageData: ImageData;
  className?: string;
}) {
  return (
    <div className={cn(props.className, "relative aspect-square")}>
      <img
        className="w-full h-full absolute inset-0"
        src={props.imageData.blurhash}
        alt="Blurred loading image"
        aria-hidden="true"
      />
      <img
        className="w-full h-full absolute inset-0"
        src={props.imageData.url}
      />
    </div>
  );
}
