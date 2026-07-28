/**
 * Pulls an OpenLibrary work id out of whatever the admin pasted.
 *
 * Accepts a full URL, a `/works/OL…W` path, or a bare id, so triage never
 * requires editing a link by hand. Edition ids (`OL…M`) are rejected rather than
 * coerced — an edition is not a work, and silently accepting one would attach
 * covers to an id the rest of the site cannot resolve.
 */
export function parseOpenLibraryWorkId(reference: string): string | null {
  const trimmed = reference.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/OL\d+W/i);
  if (!match) return null;

  return match[0].toUpperCase();
}
