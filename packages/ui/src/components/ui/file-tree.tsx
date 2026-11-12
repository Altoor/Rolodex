"use client";

import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#components/ui/collapsible";

interface FileTreeContextValue {
  selectedValue?: string;
  onSelect?: (value: string) => void;
}

const FileTreeContext = createContext<FileTreeContextValue>({});

interface FileTreeProps extends Omit<
  ComponentProps<"div">,
  "onSelect" | "children"
> {
  selectedValue?: string;
  onSelect?: (value: string) => void;
  children?: ReactNode;
}

function FileTree({
  selectedValue,
  onSelect,
  className,
  children,
  ...props
}: FileTreeProps) {
  return (
    <FileTreeContext.Provider value={{ selectedValue, onSelect }}>
      <div
        role="tree"
        data-slot="file-tree"
        className={cn("flex w-full flex-col gap-0.5 text-sm", className)}
        {...props}
      >
        {children}
      </div>
    </FileTreeContext.Provider>
  );
}

const rowClassName =
  "group/file-tree-row flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

const selectedRowClassName = "bg-muted font-medium text-foreground";

interface FileTreeFolderProps {
  /** Display name for the folder. */
  name: string;
  /** Stable value passed to onSelect; usually the entry id as a string. */
  value: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

function FileTreeFolder({
  name,
  value,
  icon,
  actions,
  children,
  open,
  defaultOpen,
  onOpenChange,
  className,
}: FileTreeFolderProps) {
  const { selectedValue, onSelect } = useContext(FileTreeContext);
  const selected = selectedValue === value;

  return (
    <Collapsible
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}
    >
      <div className="flex items-center gap-1">
        <CollapsibleTrigger
          role="treeitem"
          aria-selected={selected}
          className={cn(
            rowClassName,
            selected && selectedRowClassName,
            className,
          )}
          onClick={() => onSelect?.(value)}
        >
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/file-tree-row:rotate-90" />
          <FileTreeIcon>{icon}</FileTreeIcon>
          <FileTreeName>{name}</FileTreeName>
        </CollapsibleTrigger>
        {actions ? <FileTreeActions>{actions}</FileTreeActions> : null}
      </div>
      <CollapsibleContent>
        <div className="ml-3 flex flex-col gap-0.5 border-l pl-2">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface FileTreeFileProps {
  /** Display name for the file. */
  name: string;
  /** Stable value passed to onSelect; usually the entry id as a string. */
  value: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

function FileTreeFile({
  name,
  value,
  icon,
  actions,
  className,
}: FileTreeFileProps) {
  const { selectedValue, onSelect } = useContext(FileTreeContext);
  const selected = selectedValue === value;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        role="treeitem"
        aria-selected={selected}
        className={cn(
          rowClassName,
          selected && selectedRowClassName,
          className,
        )}
        onClick={() => onSelect?.(value)}
      >
        <span className="size-3.5 shrink-0" aria-hidden="true" />
        <FileTreeIcon>{icon}</FileTreeIcon>
        <FileTreeName>{name}</FileTreeName>
      </button>
      {actions ? <FileTreeActions>{actions}</FileTreeActions> : null}
    </div>
  );
}

function FileTreeIcon({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="file-tree-icon"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function FileTreeName({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="file-tree-name"
      className={cn("min-w-0 flex-1 truncate", className)}
      {...props}
    />
  );
}

function FileTreeActions({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="file-tree-actions"
      className={cn("ml-auto flex shrink-0 items-center gap-0.5", className)}
      {...props}
    />
  );
}

export {
  FileTree,
  FileTreeFolder,
  FileTreeFile,
  FileTreeIcon,
  FileTreeName,
  FileTreeActions,
};
