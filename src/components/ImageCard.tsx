"use client";

import type { ImageData } from "@/server/api/routers/cover";
import Image from "next/image";
import { useBlurhashUrl } from "@/lib/blurhash";
import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import Tilt from "react-parallax-tilt";
import { useExtractColors, HexToHSL } from "@/lib/extractColors";
import { Badge } from "@/components/ui/badge";
import { IconBrandReddit } from "@tabler/icons-react";

export function ImageCard(props: { imageData: ImageData; className?: string }) {
  const maxAngle = 15;
  const [isHovered, setIsHovered] = useState(false);

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
      scale={1.3}
      transitionSpeed={900}
      tiltMaxAngleX={maxAngle}
      tiltMaxAngleY={maxAngle}
      onEnter={() => setIsHovered(true)}
      onLeave={() => setIsHovered(false)}
      // className={cn("transform-style-3d", isHovered ? "z-10" : "z-0")}
      // TODO: Find out why transform-style-3d breaks clicking on Link elements
      className={isHovered ? "z-10" : "z-0"}
    >
      <Badge className="absolute z-20 aspect-square transform perspective-200 translate-z-5">
        <IconBrandReddit />
      </Badge>
      <div
        className={cn(
          "relative aspect-square cursor-pointer overflow-hidden rounded-3xl",
          props.className,
        )}
        style={style}
      >
        <Link href={`/image/${props.imageData.id}`}>
          <Image
            src={props.imageData.url}
            alt="Audiobook cover image"
            fill={true}
            placeholder="blur"
            blurDataURL={blurhashUrl}
          />
        </Link>
      </div>
    </Tilt>
  );
}
