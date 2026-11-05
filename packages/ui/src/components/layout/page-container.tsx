import { cn } from "cn";

export function PageContainer({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 lg:py-8",
        className,
      )}
      {...props}
    />
  );
}
