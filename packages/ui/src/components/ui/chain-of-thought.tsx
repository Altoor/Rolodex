"use client";

import * as React from "react";

import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "#components/ui/trace";

/**
 * Chain of Thought — a summary line that expands into the steps an agent
 * took, in the style of shadcn/ui AI elements (built on Trace).
 */

type StepStatus = "active" | "complete" | "pending" | "error";

function ChainOfThought({
  className,
  children,
  open,
  defaultOpen,
  onOpenChange,
}: {
  className?: string;
  children?: React.ReactNode;
  defaultOpen?: boolean;
} & (
  | { open?: undefined; onOpenChange?: (open: boolean) => void }
  | { open: boolean; onOpenChange: (open: boolean) => void }
)) {
  return (
    <Trace data-slot="chain-of-thought" className={className}>
      {open === undefined ? (
        <TraceCollapsible defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
          {children}
        </TraceCollapsible>
      ) : (
        <TraceCollapsible
          open={open}
          defaultOpen={defaultOpen}
          onOpenChange={onOpenChange}
        >
          {children}
        </TraceCollapsible>
      )}
    </Trace>
  );
}

function ChainOfThoughtHeader({
  className,
  icon,
  title,
  status,
  ...props
}: React.ComponentProps<typeof TraceCollapsibleTrigger> & {
  icon?: React.ReactNode;
  title: React.ReactNode;
  status?: "running" | "error" | "pending";
}) {
  return (
    <TraceCollapsibleTrigger
      data-slot="chain-of-thought-header"
      className={className}
      {...props}
    >
      <TraceLine status={status}>
        {icon ? <TraceIcon>{icon}</TraceIcon> : null}
        <TraceTitle>{title}</TraceTitle>
      </TraceLine>
    </TraceCollapsibleTrigger>
  );
}

function ChainOfThoughtContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TraceCollapsibleContent>) {
  return (
    <TraceCollapsibleContent keepMounted className={className} {...props}>
      <Trace data-slot="chain-of-thought-steps" className="gap-1.5">
        {children}
      </Trace>
    </TraceCollapsibleContent>
  );
}

function ChainOfThoughtStep({
  className,
  icon,
  title,
  description,
  status,
  ...props
}: Omit<React.ComponentProps<typeof TraceLine>, "status"> & {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  status?: StepStatus;
}) {
  const lineStatus =
    status === "active"
      ? ("running" as const)
      : status === "pending"
        ? ("pending" as const)
        : status === "error"
          ? ("error" as const)
          : undefined;

  return (
    <TraceLine
      data-slot="chain-of-thought-step"
      status={lineStatus}
      className={className}
      {...props}
    >
      {icon ? <TraceIcon>{icon}</TraceIcon> : null}
      <TraceTitle>{title}</TraceTitle>
      {description != null ? (
        <TraceDescription>{description}</TraceDescription>
      ) : null}
    </TraceLine>
  );
}

export {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
  type StepStatus,
};
