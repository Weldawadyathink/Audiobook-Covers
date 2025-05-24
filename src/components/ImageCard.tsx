import type { ImageData } from "../server/routers/cover.ts";
import { type CSSProperties, useState } from "react";
import { cn } from "../utils/utils.ts";
import Tilt from "react-parallax-tilt";
import { HexToHSL, useExtractColors } from "../utils/extractColors.ts";
import { Badge } from "./ui/Badge.tsx";
import { IconBrandReddit } from "@tabler/icons-react";
import { BlurhashCanvas } from "react-blurhash";
import { Link } from "@tanstack/react-router";
import { useBlurhashUrl } from "../utils/blurhash.ts";

export function ImageCard(
  props: {
    imageData: ImageData;
    className?: string;
    hideSourceBadge?: boolean;
    maxAngle?: number;
    zoomScale?: number;
  },
) {
  const maxAngle = props.maxAngle || 7;
  const [isHovered, setIsHovered] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const blurhashUrl = useBlurhashUrl(props.imageData.blurhash);
  const colors = useExtractColors(blurhashUrl);

  const style: CSSProperties = {};

  if (colors != undefined) {
    if (colors[0] !== undefined) {
      const { h, s, l } = HexToHSL(colors[0].hex);
      style.boxShadow = `0 0 20px hsla(${h}, ${s}%, ${l * 0.6}%, 0.5)`;
    }
  }

  return (
    <Tilt
      scale={props.zoomScale || 1.15}
      transitionSpeed={900}
      tiltMaxAngleX={maxAngle}
      tiltMaxAngleY={maxAngle}
      onEnter={() => setIsHovered(true)}
      onLeave={() => setIsHovered(false)}
      // className={cn("transform-style-3d", isHovered ? "z-10" : "z-0")}
      // TODO: Find out why transform-style-3d breaks clicking on Link elements
      className={cn(
        props.className,
        "relative aspect-square cursor-pointer, overflow-hidden rounded-3xl transform-3d",
        isHovered ? "z-10" : "z-0",
      )}
      style={style}
    >
      {!props.hideSourceBadge && (
        <Badge className="top-1 left-1 bg-stone-700 opacity-80 rounded-full absolute z-20 aspect-square transform perspective-200 translate-z-5">
          <IconBrandReddit />
        </Badge>
      )}
      <Link to={`/image/${props.imageData.id}`}>
        {!isLoaded && (
          <BlurhashCanvas
            className="h-full w-full"
            hash={props.imageData.blurhash}
          />
        )}
        <img
          src={props.imageData.optimized}
          alt="Audiobook cover image"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          style={{ display: isLoaded ? "block" : "none" }}
        />
      </Link>
    </Tilt>
  );
}
