import type { ComponentType } from "react";

export interface BlockComponentProps {
  output: unknown;
  toolKey?: string | null;
}

export interface BlockDefinition {
  id: string;
  match: (input: { output: unknown; toolKey?: string | null }) => boolean;
  Component: ComponentType<BlockComponentProps>;
}
