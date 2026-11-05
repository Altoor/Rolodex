import { Spinner } from "#components/ui/spinner";
import { cn } from "cn";

interface LoadingStateProps extends React.ComponentProps<"div"> {
  label?: string;
}

export function LoadingState({
  label = "Loading…",
  className,
  ...props
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-40 w-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground",
        className,
      )}
      {...props}
    >
      <Spinner />
      <span>{label}</span>
    </div>
  );
}
