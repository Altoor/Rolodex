import { useEffect, useRef } from "react";

interface UseLoadedEntityOptions<Entity> {
  /** Entity id to load. `undefined` clears the loaded value. */
  id: number | undefined;
  /** Loads the entity for the given id. */
  load: (id: number) => Promise<Entity | null | undefined>;
  /** Applies the loaded entity, or clears it when `entity` is null. */
  onLoaded: (entity: Entity | null) => void;
}

/**
 * Loads a single entity whenever its id changes. The latest `load` and
 * `onLoaded` callbacks are used without re-running the effect, so callers do
 * not need to memoise them.
 */
export function useLoadedEntity<Entity>({
  id,
  load,
  onLoaded,
}: UseLoadedEntityOptions<Entity>) {
  const loadRef = useRef(load);
  const onLoadedRef = useRef(onLoaded);

  useEffect(() => {
    loadRef.current = load;
    onLoadedRef.current = onLoaded;
  });

  useEffect(() => {
    let cancelled = false;

    if (id === undefined) {
      onLoadedRef.current(null);
      return;
    }

    void loadRef.current(id).then((entity) => {
      if (!cancelled) onLoadedRef.current(entity ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [id]);
}
