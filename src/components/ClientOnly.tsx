import { useSyncExternalStore } from "react";

// "Has this component hydrated yet?" is external state, not React state.
// `getServerSnapshot` runs during SSR and hydration, `getSnapshot` after —
// which is exactly the client-only signal, without a setState-in-effect pass.
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function ClientOnly({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  if (!mounted) return null;
  return <>{children}</>;
}
