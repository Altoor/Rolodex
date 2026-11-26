"use client";

import { createContext, createElement, useContext } from "react";
import type { ReactNode } from "react";
import { currentOriginLocation, resolveApiOrigin } from "./apiOrigin";

const ApiOriginContext = createContext<string | null>(null);

interface ApiOriginProviderProps {
  /** Runtime `API_PUBLIC_ORIGIN` from the server; empty means "derive it". */
  apiOrigin?: string | null;
  children: ReactNode;
}

/**
 * Supplies the public backend origin to client components. The value comes
 * from the server at request time, so changing `API_PUBLIC_ORIGIN` does not
 * require rebuilding the web bundle.
 */
export function ApiOriginProvider({
  apiOrigin,
  children,
}: ApiOriginProviderProps) {
  return createElement(
    ApiOriginContext.Provider,
    { value: apiOrigin ?? null },
    children,
  );
}

/** Resolves the backend origin for the current render. */
export function useApiOrigin(): string {
  const configured = useContext(ApiOriginContext);

  return resolveApiOrigin({
    configured,
    location: currentOriginLocation(),
  });
}
