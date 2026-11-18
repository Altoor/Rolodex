import { useRef } from "react";
import { FilePlus, FolderPlus, RefreshCw, Upload } from "lucide-react";
import { Button } from "#components/ui/button";
import { Spinner } from "#components/ui/spinner";

interface FilesToolbarProps {
  uploading: boolean;
  refreshing: boolean;
  onCreateFolder: () => void;
  onCreateFile: () => void;
  onUpload: (files: File[]) => void;
  onRefresh: () => void;
}

export function FilesToolbar({
  uploading,
  refreshing,
  onCreateFolder,
  onCreateFile,
  onUpload,
  onRefresh,
}: FilesToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap gap-1">
      <Button type="button" variant="outline" size="sm" onClick={onCreateFolder}>
        <FolderPlus />
        New folder
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onCreateFile}>
        <FilePlus />
        New file
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? <Spinner className="size-3.5" /> : <Upload />}
        {uploading ? "Uploading…" : "Upload"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={refreshing}
      >
        {refreshing ? <Spinner className="size-3.5" /> : <RefreshCw />}
        {refreshing ? "Refreshing…" : "Refresh"}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) onUpload(files);
        }}
      />
    </div>
  );
}
