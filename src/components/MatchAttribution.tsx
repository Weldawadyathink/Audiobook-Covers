import { BadgeCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImageData } from "@/server/imageData";

type Confidence = NonNullable<ImageData["openlibrary"]>["confidence"];

/**
 * How a cover got attached to its book, and how much to trust it.
 *
 * The wording maps to the evidence grades the matching pipeline assigns in
 * `src/trigger/extract-olid/utils.ts`. Note that "CONFIRMED" there means the AI
 * found unambiguous evidence, *not* that a person signed off — so it must not be
 * worded as a confirmation, or it reads as human review.
 *
 * Strength is shown as filled bars rather than by colour so the level still
 * reads without relying on hue.
 */
const attribution = {
  HUMAN: {
    icon: BadgeCheck,
    iconClass: "text-emerald-300",
    label: "Curated by a human",
    detail: "Someone checked this cover against the book.",
    strength: null,
  },
  CONFIRMED: {
    icon: Sparkles,
    iconClass: "text-cyan-300",
    label: "AI match · high confidence",
    detail: "The text on the cover matched this book exactly.",
    strength: 3,
  },
  LIKELY: {
    icon: Sparkles,
    iconClass: "text-sky-300/80",
    label: "AI match · probable",
    detail: "A strong match, but the cover text wasn't conclusive.",
    strength: 2,
  },
  UNCERTAIN: {
    icon: Sparkles,
    iconClass: "text-slate-400",
    label: "AI match · best guess",
    detail: "Little readable text on this cover — this may be wrong.",
    strength: 1,
  },
} as const satisfies Record<
  Confidence,
  {
    icon: typeof BadgeCheck;
    iconClass: string;
    label: string;
    detail: string;
    strength: number | null;
  }
>;

function StrengthMeter({ strength }: { strength: number }) {
  return (
    <span
      className="flex items-center gap-0.5"
      title={`${strength} of 3`}
      aria-hidden="true"
    >
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={cn(
            "h-3 w-1 rounded-full transition-colors",
            bar <= strength ? "bg-slate-200" : "bg-white/15",
          )}
        />
      ))}
    </span>
  );
}

export function MatchAttribution({ confidence }: { confidence: Confidence }) {
  const { icon: Icon, iconClass, label, detail, strength } =
    attribution[confidence];

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon className={cn("size-4 shrink-0", iconClass)} />
        <span className="text-xs font-semibold text-slate-100">{label}</span>
        {strength !== null && (
          <span className="ml-auto">
            <StrengthMeter strength={strength} />
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs leading-snug text-slate-400">{detail}</p>
    </div>
  );
}
