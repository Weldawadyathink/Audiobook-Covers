/**
 * Turning archived Reddit data into candidate image URLs.
 *
 * Everything here is a pure function of rows already in Postgres. No network,
 * no clock, no randomness — feed it the same post and it emits the same
 * candidates. That is what allows six years of history to be re-resolved in
 * seconds whenever a new host is taught below.
 */

/**
 * Bump when the extraction rules change in a way that should re-run over
 * history.
 *
 * `reddit-resolve-links` claims any post whose `resolver_version` is below this,
 * so incrementing it re-queues the entire subreddit with no migration and no
 * Reddit traffic. Adding a host, fixing a URL rewrite and changing a status
 * policy all warrant a bump; a comment or a refactor does not.
 */
export const RESOLVER_VERSION = 1;

export type CandidateKind =
  | "reddit_image"
  | "imgur_image"
  | "imgur_album"
  | "drive_file"
  | "drive_folder"
  | "direct_image"
  | "archive"
  | "other_host"
  | "ignored";

export type CandidateStatus = "PENDING" | "UNSUPPORTED" | "IGNORED";

export interface Candidate {
  post_id: string;
  comment_id: string | null;
  url: string;
  host: string;
  kind: CandidateKind;
  ordinal: number | null;
  status: CandidateStatus;
}

export interface ResolvablePost {
  id: string;
  body: string | null;
  url: string | null;
  /** Raw `gallery_data` and `media_metadata`, straight off the archived payload. */
  gallery_data: unknown;
  media_metadata: unknown;
}

export interface ResolvableComment {
  id: string;
  body: string | null;
}

/**
 * Hosts that carry images we cannot fetch yet.
 *
 * Recorded as `UNSUPPORTED` rather than dropped so the backlog stays queryable
 * and enabling one later is an UPDATE, not a re-crawl. mediafire and mega are
 * here by choice — ~240 links, almost all of them multi-cover archives needing
 * an unpack step rather than a download.
 */
const UNSUPPORTED_HOSTS = new Set([
  "mediafire.com",
  "www.mediafire.com",
  "mega.nz",
  "mega.co.nz",
  "ibb.co",
  "postimg.cc",
  "catbox.moe",
  "files.catbox.moe",
  "artstation.com",
  "www.artstation.com",
  "behance.net",
  "www.behance.net",
  "dropbox.com",
  "www.dropbox.com",
]);

/**
 * Hosts that never hold community artwork worth importing.
 *
 * Retail listings, reference links and discussion. Recorded as `IGNORED` so the
 * decision is visible and reversible instead of vanishing inside a regex.
 */
const IGNORED_HOSTS = new Set([
  "reddit.com",
  "www.reddit.com",
  "old.reddit.com",
  "new.reddit.com",
  "np.reddit.com",
  "sh.reddit.com",
  "redd.it",
  "facebook.com",
  "www.facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "www.instagram.com",
  "audiobookcovers.com",
  "www.audiobookcovers.com",
  "amazon.com",
  "www.amazon.com",
  "m.media-amazon.com",
  "images-na.ssl-images-amazon.com",
  "audible.com",
  "www.audible.com",
  "goodreads.com",
  "www.goodreads.com",
  "en.wikipedia.org",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "github.com",
  "web.archive.org",
  "encrypted-tbn0.gstatic.com",
  "docs.google.com",
]);

const IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i;

/**
 * URLs inside Reddit markdown.
 *
 * The trailing character class excludes the punctuation that ends a sentence or
 * closes a markdown link, which would otherwise be swallowed into the URL and
 * produce a 404 at download time.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"'`\])]+/g;

/** Strip trailing punctuation a sentence left behind. */
function trimUrl(raw: string): string {
  return raw.replace(/[.,;:!?]+$/, "").replace(/\*+$/, "");
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase();
}

/** `image/jpg` → `jpg`. Reddit uses a handful of non-standard spellings. */
function extensionFromMime(mime: string): string {
  const subtype = mime.split("/")[1]?.toLowerCase() ?? "jpg";
  if (subtype === "jpeg") return "jpg";
  return subtype.replace(/[^a-z0-9]/g, "") || "jpg";
}

/**
 * Rewrite a signed `preview.redd.it` URL to its durable `i.redd.it` original.
 *
 * Preview URLs carry an `s=` signature that expires, so storing one produces a
 * table of links that rot silently between resolve and download. The rewrite is
 * verified: `i.redd.it/<media id>.<ext>` returns the full-resolution original,
 * not the downscaled preview.
 *
 * Returns null when the filename is not a bare media id — external previews are
 * proxies of a third-party image and have no Reddit-hosted original at all.
 */
function previewToDirect(url: URL): string | null {
  const file = url.pathname.split("/").pop();
  if (!file) return null;

  const match = /^([a-z0-9]+)\.([a-z0-9]+)$/i.exec(file);
  if (match) return `https://i.redd.it/${match[1]}.${match[2]}`;

  // Modern gallery previews slug the filename: `some-title-v0-<id>.jpg`.
  const slugged = /^.*-([a-z0-9]{8,})\.([a-z0-9]+)$/i.exec(file);
  if (slugged) return `https://i.redd.it/${slugged[1]}.${slugged[2]}`;

  return null;
}

/**
 * Classify one extracted URL into a kind, a canonical form and a status.
 *
 * Returns null only for input that is not a usable URL at all.
 */
function classify(
  raw: string,
): Pick<Candidate, "url" | "host" | "kind" | "status"> | null {
  let url: URL;
  try {
    url = new URL(trimUrl(raw));
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = hostOf(url);

  if (host === "i.redd.it") {
    // Query strings on i.redd.it are display hints; the bare path is the file.
    return {
      url: `https://i.redd.it${url.pathname}`,
      host,
      kind: "reddit_image",
      status: "PENDING",
    };
  }

  if (host === "preview.redd.it") {
    const direct = previewToDirect(url);
    return direct
      ? {
          url: direct,
          host: "i.redd.it",
          kind: "reddit_image",
          status: "PENDING",
        }
      : {
          url: url.toString(),
          host,
          kind: "other_host",
          status: "UNSUPPORTED",
        };
  }

  // A proxy of someone else's image. The original is normally linked elsewhere
  // in the same post, so importing the proxy would duplicate it at lower quality.
  if (host === "external-preview.redd.it") {
    return { url: url.toString(), host, kind: "ignored", status: "IGNORED" };
  }

  if (host === "i.imgur.com") {
    return {
      url: `https://i.imgur.com${url.pathname}`,
      host,
      kind: "imgur_image",
      status: "PENDING",
    };
  }

  if (
    host === "imgur.com" ||
    host === "www.imgur.com" ||
    host === "m.imgur.com"
  ) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "a" || segments[0] === "gallery") {
      return {
        url: `https://imgur.com/${segments[0]}/${segments[1] ?? ""}`,
        host: "imgur.com",
        kind: "imgur_album",
        status: "PENDING",
      };
    }
    // A bare `imgur.com/<id>` — a single image whose extension the downloader
    // has to discover.
    if (segments.length === 1 && segments[0]) {
      return {
        url: `https://imgur.com/${segments[0]}`,
        host: "imgur.com",
        kind: "imgur_image",
        status: "PENDING",
      };
    }
    return {
      url: url.toString(),
      host: "imgur.com",
      kind: "other_host",
      status: "UNSUPPORTED",
    };
  }

  if (host === "drive.google.com") {
    const fileMatch = /\/file\/d\/([^/]+)/.exec(url.pathname);
    const folderMatch = /\/(?:drive\/)?folders\/([^/]+)/.exec(url.pathname);
    const idParam = url.searchParams.get("id");

    if (folderMatch) {
      return {
        url: `https://drive.google.com/drive/folders/${folderMatch[1]}`,
        host,
        kind: "drive_folder",
        status: "PENDING",
      };
    }
    const fileId = fileMatch?.[1] ?? idParam;
    if (fileId) {
      return {
        url: `https://drive.google.com/file/d/${fileId}/view`,
        host,
        kind: "drive_file",
        status: "PENDING",
      };
    }
    return {
      url: url.toString(),
      host,
      kind: "other_host",
      status: "UNSUPPORTED",
    };
  }

  if (IGNORED_HOSTS.has(host)) {
    return { url: url.toString(), host, kind: "ignored", status: "IGNORED" };
  }

  if (UNSUPPORTED_HOSTS.has(host)) {
    const isArchive = host.includes("mediafire") || host.includes("mega");
    return {
      url: url.toString(),
      host,
      kind: isArchive ? "archive" : "other_host",
      status: "UNSUPPORTED",
    };
  }

  // Any unknown host still counts if the URL names an image file outright.
  if (IMAGE_EXTENSION.test(url.pathname)) {
    return {
      url: url.toString(),
      host,
      kind: "direct_image",
      status: "PENDING",
    };
  }

  return {
    url: url.toString(),
    host,
    kind: "other_host",
    status: "UNSUPPORTED",
  };
}

/**
 * Gallery items, in the order the submitter arranged them.
 *
 * Built from `media_metadata` rather than the `s.u` preview URL each entry
 * carries, because those are signed and expire. The media id plus the declared
 * mime type reconstructs the permanent `i.redd.it` original directly.
 */
function galleryCandidates(post: ResolvablePost): Candidate[] {
  const gallery = post.gallery_data as
    | { items?: { media_id?: unknown }[] }
    | null
    | undefined;
  const metadata = post.media_metadata as
    | Record<string, { m?: unknown; status?: unknown }>
    | null
    | undefined;

  const items = gallery?.items;
  if (!Array.isArray(items) || !metadata) return [];

  return items.flatMap((item, index) => {
    const mediaId = item?.media_id;
    if (typeof mediaId !== "string") return [];

    const meta = metadata[mediaId];
    // Reddit keeps entries for images it has since lost, flagged non-valid.
    if (!meta || (meta.status && meta.status !== "valid")) return [];

    const mime = typeof meta.m === "string" ? meta.m : "image/jpg";
    return [
      {
        post_id: post.id,
        comment_id: null,
        url: `https://i.redd.it/${mediaId}.${extensionFromMime(mime)}`,
        host: "i.redd.it",
        kind: "reddit_image" as const,
        ordinal: index,
        status: "PENDING" as const,
      },
    ];
  });
}

function fromText(
  text: string | null,
  postId: string,
  commentId: string | null,
): Candidate[] {
  if (!text) return [];
  return (text.match(URL_PATTERN) ?? []).flatMap((raw) => {
    const classified = classify(raw);
    if (!classified) return [];
    return [
      { post_id: postId, comment_id: commentId, ordinal: null, ...classified },
    ];
  });
}

/**
 * All candidate URLs for one submission and its comment tree.
 *
 * Deduplicated on `(comment_id, url)` so a link repeated inside one body
 * collapses, while the same URL appearing in both the post and a reply stays as
 * two rows — those are genuinely different provenance and the downloader may
 * want either.
 */
export function resolvePost(
  post: ResolvablePost,
  comments: ResolvableComment[],
): Candidate[] {
  const candidates: Candidate[] = [
    ...galleryCandidates(post),
    ...fromText(post.body, post.id, null),
    ...comments.flatMap((comment) =>
      fromText(comment.body, post.id, comment.id),
    ),
  ];

  // The submission's own target. Skipped for galleries, where `url` is just the
  // `/gallery/<id>` permalink and the real images came from `gallery_data`.
  if (post.url && !post.url.includes("/gallery/")) {
    const classified = classify(post.url);
    if (classified) {
      candidates.push({
        post_id: post.id,
        comment_id: null,
        ordinal: null,
        ...classified,
      });
    }
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.comment_id ?? ""} ${candidate.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
