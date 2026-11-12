"use client";

import { cn } from "cn";
import {
  toolStatePathColors,
  type ToolStatePathSuggestion,
} from "#lib/toolStatePaths";
import {
  useRef,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const BADGE_CLASS =
  "cursor-grab rounded-md border border-[hsl(var(--path-hue)_60%_70%)] bg-[hsl(var(--path-hue)_80%_93%)] px-1.5 py-0.5 font-mono text-xs text-[hsl(var(--path-hue)_65%_30%)] active:cursor-grabbing dark:border-[hsl(var(--path-hue)_55%_45%)] dark:bg-[hsl(var(--path-hue)_45%_20%)] dark:text-[hsl(var(--path-hue)_85%_78%)]";

const HIGHLIGHT_CLASS =
  "text-[hsl(var(--path-hue)_65%_32%)] dark:text-[hsl(var(--path-hue)_85%_75%)]";

const hueStyle = (hue: number): CSSProperties =>
  ({ "--path-hue": hue }) as CSSProperties;

/** Colour each known tool-state path inside a piece of text. */
function highlightText(text: string, knownPaths: readonly string[]): ReactNode {
  if (!text) return null;

  const paths = [...new Set(knownPaths)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (paths.length === 0) return text;

  const pattern = new RegExp(
    `(?<![\\w$.])(${paths.map(escapeRegExp).join("|")})(?![\\w$.])`,
    "g",
  );

  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index));

    const path = match[0];
    const colors = toolStatePathColors(path);
    nodes.push(
      <span
        key={`${index}:${path}`}
        className={HIGHLIGHT_CLASS}
        style={hueStyle(colors.hue)}
      >
        {path}
      </span>,
    );
    lastIndex = index + path.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));

  return nodes.length > 0 ? nodes : text;
}

interface PathSuggestionBadgesProps {
  suggestions: ToolStatePathSuggestion[];
  onInsert: (path: string) => void;
  className?: string;
}

export function PathSuggestionBadges({
  suggestions,
  onInsert,
  className,
}: PathSuggestionBadgesProps) {
  if (suggestions.length === 0) return null;

  return (
    <div
      className={cn("flex flex-wrap gap-1.5", className)}
      aria-label="Earlier tool-state values"
    >
      {suggestions.map((suggestion) => {
        const { hue } = toolStatePathColors(suggestion.path);
        return (
          <button
            key={suggestion.path}
            type="button"
            draggable
            onClick={() => onInsert(suggestion.path)}
            onDragStart={(event: DragEvent<HTMLButtonElement>) => {
              event.dataTransfer.setData("text/plain", suggestion.path);
              event.dataTransfer.effectAllowed = "copy";
            }}
            className={BADGE_CLASS}
            style={hueStyle(hue)}
            title={`From ${suggestion.sourceTaskName}. Drag into the field or click to insert.`}
          >
            {suggestion.path}
          </button>
        );
      })}
    </div>
  );
}

export interface PathTextControlProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: ToolStatePathSuggestion[];
  textarea?: boolean;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  knownPaths?: string[];
}

/**
 * An input or textarea that highlights known tool-state paths in place and
 * accepts path badges via drag-and-drop or click.
 */
export function PathTextControl({
  id,
  value,
  onChange,
  suggestions,
  textarea = false,
  placeholder,
  className,
  invalid = false,
  knownPaths,
}: PathTextControlProps) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const selectionRef = useRef<number | null>(null);

  const known = knownPaths ?? suggestions.map((suggestion) => suggestion.path);

  const rememberSelection = () => {
    const element = ref.current;
    if (!element) return;
    selectionRef.current = element.selectionStart;
  };

  const insert = (snippet: string) => {
    const position = selectionRef.current ?? value.length;
    const next = `${value.slice(0, position)}${snippet}${value.slice(position)}`;

    onChange(next);
    selectionRef.current = position + snippet.length;

    requestAnimationFrame(() => {
      const target = ref.current;
      if (!target) return;
      target.focus();
      target.setSelectionRange(
        position + snippet.length,
        position + snippet.length,
      );
    });
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    const snippet = event.dataTransfer.getData("text/plain");
    if (!snippet) return;
    event.preventDefault();
    insert(snippet);
  };

  const sharedProps = {
    id,
    value,
    placeholder,
    "aria-invalid": invalid || undefined,
    onDrop,
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes("text/plain")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onSelect: rememberSelection,
    onClick: rememberSelection,
    onKeyUp: rememberSelection,
    onFocus: rememberSelection,
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 overflow-hidden px-2.5 text-base md:text-sm",
            textarea
              ? "whitespace-pre-wrap break-words py-2"
              : "flex items-center whitespace-pre py-1",
            className,
          )}
        >
          {highlightText(value, known)}
        </div>

        {textarea ? (
          <textarea
            {...sharedProps}
            ref={(element) => {
              ref.current = element;
            }}
            onChange={(event) => {
              onChange(event.target.value);
              rememberSelection();
            }}
            className={cn(
              "relative flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base text-transparent caret-foreground transition-colors outline-none placeholder:text-muted-foreground selection:bg-primary/25 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-transparent dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
              className,
            )}
          />
        ) : (
          <input
            {...sharedProps}
            ref={(element) => {
              ref.current = element;
            }}
            onChange={(event) => {
              onChange(event.target.value);
              rememberSelection();
            }}
            className={cn(
              "relative h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base text-transparent caret-foreground transition-colors outline-none placeholder:text-muted-foreground selection:bg-primary/25 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-transparent dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
              className,
            )}
          />
        )}
      </div>

      <PathSuggestionBadges suggestions={suggestions} onInsert={insert} />
    </div>
  );
}
