import React from "react";

export interface ShieldsBadgeProps {
  label?: string;
  message?: string;
  color?: string;

  style?: "flat" | "flat-square" | "plastic" | "for-the-badge" | "social";
  logo?: string; // simple-icons slug
  logoColor?: string;
  logoWidth?: number;
  logoSvg?: string;
  labelColor?: string;
  cacheSeconds?: string;
  href?: string;
  alt?: string;
  className?: string;
  logoSize?: string; // 'auto' or px value (for simple-icons only)

  url?: string;
  up_message?: string;
  up_color?: string;
  down_message?: string;
  down_color?: string;
}

export const ShieldsBadge: React.FC<ShieldsBadgeProps> = ({
  label,
  message,
  color,
  style,
  logo,
  logoColor,
  logoWidth,
  logoSvg,
  labelColor,
  cacheSeconds,
  href,
  alt,
  className,
  logoSize,
  url,
  up_message,
  up_color,
  down_message,
  down_color,
}) => {
  // Build the badge path
  let badgePath = "badge/";
  if (label && message) {
    badgePath += `${encodeURIComponent(label)}-${encodeURIComponent(message)}`;
  } else if (label) {
    badgePath += encodeURIComponent(label);
  } else if (message) {
    badgePath += encodeURIComponent(message);
  }
  if (color) {
    badgePath += `-${encodeURIComponent(color)}`;
  }

  // Build query params
  const params: Record<string, string> = {};
  if (style) params.style = style;
  if (logo) params.logo = logo;
  if (logoColor) params.logoColor = logoColor;
  if (logoWidth !== undefined) params.logoWidth = String(logoWidth);
  if (logoSvg) params.logoSvg = logoSvg;
  if (labelColor) params.labelColor = labelColor;
  if (cacheSeconds) params.cacheSeconds = cacheSeconds;
  if (logoSize) params.logoSize = logoSize;
  if (url) params.url = url;
  if (up_message) params.up_message = up_message;
  if (up_color) params.up_color = up_color;
  if (down_message) params.down_message = down_message;
  if (down_color) params.down_color = down_color;

  const query = Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");

  const src = `https://img.shields.io/${badgePath}.svg${query ? `?${query}` : ""}`;

  return (
    <a
      href={href || "https://shields.io/"}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={alt || label || message || "Shields.io badge"}
    >
      <img
        src={src}
        alt={alt || label || message || "Shields.io badge"}
        className={className}
      />
    </a>
  );
};
