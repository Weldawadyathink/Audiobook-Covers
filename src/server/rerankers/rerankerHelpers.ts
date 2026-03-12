import { type ImageData } from "../imageData";

export function embedAndSortRelevanceScoreIntoImageData(
  images: ImageData[],
  relevanceScores: { id: string; relevanceScore: number }[],
): ImageData[] {
  const embedded = images.map((image) => ({
    ...image,
    score: relevanceScores.find((s) => s.id === image.id)?.relevanceScore,
  }));
  return embedded.sort((a, b) => (b.score || 0) - (a.score || 0));
}
