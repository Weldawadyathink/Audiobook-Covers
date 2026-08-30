import { cn } from "@/lib/utils";

/**
 * The one frosted surface every page sits on, so panels stay identical across
 * search, the cover page, about and contribute.
 */
export function Panel({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-white/10 bg-slate-950/40 shadow-2xl shadow-slate-950/30 backdrop-blur",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
