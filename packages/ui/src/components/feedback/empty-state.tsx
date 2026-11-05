import { buttonVariants } from "#components/ui/button";
import { cn } from "cn";

interface EmptyStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actionHref?: string;
  actionLabel?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{title}</h2>
        {description ? (
          <p className="max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ??
        (actionHref && actionLabel ? (
          <a href={actionHref} className={buttonVariants()}>
            {actionLabel}
          </a>
        ) : null)}
    </div>
  );
}
