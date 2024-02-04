export interface Item {
  id: string;
  extension: string;
  source: string;
}

export interface ResponseObject {
  filename: string;
  versions: {
    webp: { [key: number | string]: string };
    jpeg: { [key: number | string]: string };
    png: { [key: number | string]: string };
  };
  id: string;
  permalink: string;
  source: string;
}

export function generateResponseObject(item: Item) {
  /**
   * Returns a javascript object with all required data included
   * Designed to have an algolia or pinecone database response
   */
  const base_download_url = "https://download.audiobookcovers.com";
  const id = item.id;
  const ext = item.extension;
  const source = item.source;
  return {
    filename: `${base_download_url}/original/${id}.${ext}`,
    versions: {
      webp: {
        200: `${base_download_url}/webp/200/${id}.webp`,
        500: `${base_download_url}/webp/500/${id}.webp`,
        1000: `${base_download_url}/webp/1000/${id}.webp`,
        original: `${base_download_url}/webp/original/${id}.webp`,
      },
      jpeg: {
        200: `${base_download_url}/jpg/200/${id}.jpg`,
        500: `${base_download_url}/jpg/500/${id}.jpg`,
        1000: `${base_download_url}/jpg/1000/${id}.jpg`,
        original: `${base_download_url}/jpg/original/${id}.jpg`,
      },
      png: {
        200: `${base_download_url}/png/200/${id}.png`,
        500: `${base_download_url}/png/500/${id}.png`,
        1000: `${base_download_url}/png/1000/${id}.png`,
        original: `${base_download_url}/png/original/${id}.png`,
      },
    },
    id: id,
    permalink: `https://audiobookcovers.com/?id=${id}`,
    source: source,
  };
}
