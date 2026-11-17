import { X } from "lucide-react";
import { Button } from "#components/ui/button";

interface AttachmentChipsProps {
  files: File[];
  disabled?: boolean;
  onRemove: (index: number) => void;
}

/** Files queued for the next run; removing one only drops the attachment. */
export function AttachmentChips({
  files,
  disabled,
  onRemove,
}: AttachmentChipsProps) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Attachments">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${index}`}
          className="flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-3 text-xs"
        >
          <span className="max-w-56 truncate" title={file.name}>
            {file.name}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${file.name}`}
            onClick={() => onRemove(index)}
            disabled={disabled}
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  );
}
