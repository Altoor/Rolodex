"use client";

import { Fragment } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "#components/ui/breadcrumb";
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "#components/ui/accordion";
import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { FileDownloadButton } from "./file-download-button";
import { fileTypeLabel, type FileEntry } from "./types";

interface FilePreviewHeaderProps {
  entry: FileEntry;
  ancestors: FileEntry[];
  onSelectFolder: (id: number | null) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function FilePreviewHeader({
  entry,
  ancestors,
  onSelectFolder,
  onEdit,
  onDelete,
}: FilePreviewHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => onSelectFolder(null)}>
              Files
            </BreadcrumbLink>
          </BreadcrumbItem>
          {ancestors.map((ancestor) => (
            <Fragment key={ancestor.id}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink onClick={() => onSelectFolder(ancestor.id)}>
                  {ancestor.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </Fragment>
          ))}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{entry.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold tracking-tight">
              {entry.name}
            </h2>
            <Badge variant="outline">
              {entry.kind === "folder"
                ? "folder"
                : fileTypeLabel(entry.fileType)}
            </Badge>
          </div>
          {entry.mimeType ? (
            <p className="truncate text-xs text-muted-foreground">
              {entry.mimeType}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {entry.kind === "file" ? <FileDownloadButton entry={entry} /> : null}
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 />
            Delete
          </Button>
        </div>
      </div>

      <Accordion defaultValue={["description"]}>
        <AccordionItem value="description">
          <AccordionTrigger>Description</AccordionTrigger>
          <AccordionPanel>
            <p className="pb-2 whitespace-pre-wrap text-muted-foreground">
              {entry.description || "No description yet."}
            </p>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
