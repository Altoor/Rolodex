import { Button } from "#components/ui/button";
import { cn } from "cn";

interface ErrorStateProps extends React.ComponentProps<"div"> {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
}

const errorMessage = (error: unknown): string | undefined => {
  if (!error) return undefined;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }

  return "Something went wrong.";
};

export function ErrorState({
  title = "Something went wrong",
  error,
  onRetry,
  className,
  ...props
}: ErrorStateProps) {
  const message = errorMessage(error);

  return (
    <div
      role="alert"
      className={cn(
        "flex w-full flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <p className="font-medium text-destructive">{title}</p>
        {message ? <p className="text-muted-foreground">{message}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
