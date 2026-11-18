import { ExternalLink } from "lucide-react";
import { buttonVariants } from "#components/ui/button";

interface MediaOpenLinkProps {
  url: string;
}

export function MediaOpenLink({ url }: MediaOpenLinkProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <ExternalLink />
      Open in new tab
    </a>
  );
}
