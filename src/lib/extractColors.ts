import { useEffect, useState } from "react";
import { extractColors } from "extract-colors";

export function useExtractColors(blurhashUrl: string) {
  const [colors, setColors] =
    useState<Awaited<ReturnType<typeof extractColors>>>();

  useEffect(() => {
    extractColors(blurhashUrl).then(setColors).catch(console.error);
  }, [blurhashUrl]);

  return colors;
}

export function HexToHSL(hex: string): { h: number; s: number; l: number } {
  // https://www.jameslmilner.com/posts/converting-rgb-hex-hsl-colors/
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

  if (!result) {
    throw new Error("Could not parse Hex Color");
  }

  // @ts-expect-error someone else's code
  const rHex = parseInt(result[1], 16);
  // @ts-expect-error someone else's code
  const gHex = parseInt(result[2], 16);
  // @ts-expect-error someone else's code
  const bHex = parseInt(result[3], 16);

  const r = rHex / 255;
  const g = gHex / 255;
  const b = bHex / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  let h = (max + min) / 2;
  let s = h;
  let l = h;

  if (max === min) {
    // Achromatic
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    case b:
      h = (r - g) / d + 4;
      break;
  }
  h /= 6;

  s = s * 100;
  s = Math.round(s);
  l = l * 100;
  l = Math.round(l);
  h = Math.round(360 * h);

  return { h, s, l };
}