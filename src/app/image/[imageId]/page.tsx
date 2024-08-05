"use client";

import { api } from "@/trpc/react";
import Image from "next/image";
import React, { useState } from "react";
import { ImageCard } from "@/components/ImageCard";
import Tilt from "react-parallax-tilt";
import { getBlurhashUrl } from "@/lib/blurhash";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/Spinner";
import Link from "next/link";
import useDownloader from "react-use-downloader";

const maxSimilarityLevel = 5;

export default function Page({ params }: { params: { imageId: string } }) {
  const { download } = useDownloader();
  const image = api.cover.getCover.useQuery(params.imageId);
  const [similarity, setSimilarity] = useState(1);
  const similar = api.cover.getSimilar.useQuery({
    id: params.imageId,
    similarityThreshold: similarity,
  });

  const maxAngle = 5;

  function increaseSimilarity() {
    setSimilarity((s) => {
      if (s >= maxSimilarityLevel) {
        return s;
      }
      return s + 1;
    });
  }

  return (
    <>
      {image.status === "pending" && <Spinner />}
      {image.status === "error" && <span>Could not find image</span>}
      {image.status === "success" && (
        <>
          <div className="flex flex-row justify-center gap-6">
            <Button
              onClick={() =>
                download(image.data.url, image.data.url.split("/").pop()!)
              }
            >
              Download
            </Button>
            <Button asChild>
              <Link href={image.data.source}>Source</Link>
            </Button>
          </div>
          <Tilt tiltMaxAngleX={maxAngle} tiltMaxAngleY={maxAngle}>
            <div className="relative m-8 aspect-square overflow-hidden rounded-3xl">
              <Image
                src={image.data.url}
                alt="Audiobook cover image"
                fill={true}
                placeholder="blur"
                priority={true}
                // TODO: See if this function runs a lot and memoize
                blurDataURL={getBlurhashUrl(image.data.blurhash)}
              />
            </div>
          </Tilt>
        </>
      )}

      <span>Similar Images</span>
      {similar.status === "pending" && <Spinner />}
      {similar.status === "error" && <span>Error finding similar images</span>}
      {similar.status === "success" && (
        <>
          <div className="flex flex-wrap justify-center gap-6 p-12">
            {similar.data?.map((image) => (
              <ImageCard imageData={image} key={image.id} className="w-56" />
            ))}
          </div>
          {similarity < maxSimilarityLevel && (
            <div className="flex flex-row justify-center">
              <Button
                className="text-2xl"
                variant="ghost"
                onClick={increaseSimilarity}
              >
                Show more
              </Button>
            </div>
          )}
        </>
      )}
      <div className="my-6" />
    </>
  );
}
