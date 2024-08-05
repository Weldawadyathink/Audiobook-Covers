"use client";

import { api } from "@/trpc/react";
import { ImageCard } from "@/components/ImageCard";

export function RandomView() {
  const numImages = 50;
  const images = api.cover.getRandom.useQuery({ n: numImages });

  return (
    <div className="flex flex-wrap justify-center gap-6 p-12">
      {images.data?.map((image) => (
        <ImageCard imageData={image} key={image.id} className="w-56" />
      ))}
    </div>
  );
}
