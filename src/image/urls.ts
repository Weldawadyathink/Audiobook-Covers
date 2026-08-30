/**
 * Where the served copies of a cover live.
 *
 * The bucket is public behind this hostname and the key layout is the contract
 * between `generate-image-sizes`, which writes the objects, and everything that
 * displays one. Dependency-free so the browser, the Worker and the tasks can all
 * import it.
 */
export const IMAGE_URL_PREFIX = "https://images.audiobookcovers.com";

export type CoverSize = 320 | 640 | 1280 | "original";

/** The JPEG derivative at a given width. Present for every live image. */
export function jpegCoverUrl(id: string, size: CoverSize = 640): string {
  return `${IMAGE_URL_PREFIX}/jpeg/${size}/${id}.jpg`;
}
