"use client";

import { Button } from "#components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import { fromDateTimeLocal, toDateTimeLocal } from "#lib/todo-date";
import { useEffect, useId } from "react";
import { useForm } from "react-hook-form";
import type { TodoDraft, TodoItemData } from "./types";

interface TodoFormInputs {
  name: string;
  description: string;
  doByDate: string;
}

interface TodoFormProps {
  initialTodo?: TodoItemData;
  submitLabel?: string;
  onSubmit: (draft: TodoDraft) => Promise<void> | void;
  onCancel?: () => void;
}

export function TodoForm({
  initialTodo,
  submitLabel = initialTodo ? "Save" : "Create todo",
  onSubmit,
  onCancel,
}: TodoFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TodoFormInputs>({
    mode: "onSubmit",
    defaultValues: {
      name: initialTodo?.name ?? "",
      description: initialTodo?.description ?? "",
      doByDate: toDateTimeLocal(initialTodo?.doByDate),
    },
  });

  const fieldId = useId();

  useEffect(() => {
    reset({
      name: initialTodo?.name ?? "",
      description: initialTodo?.description ?? "",
      doByDate: toDateTimeLocal(initialTodo?.doByDate),
    });
  }, [initialTodo, reset]);

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit({
        name: values.name.trim(),
        description: values.description.trim(),
        doByDate: fromDateTimeLocal(values.doByDate),
      });
    } catch (err) {
      setError("root", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={`${fieldId}-name`}>Name</FieldLabel>
          <Input
            id={`${fieldId}-name`}
            placeholder="What needs doing?"
            {...register("name", {
              validate: (value) => (value.trim() ? true : "name is required"),
            })}
          />
          <FieldError errors={[errors.name]} />
        </Field>

        <Field>
          <FieldLabel htmlFor={`${fieldId}-description`}>
            Description
          </FieldLabel>
          <Textarea
            id={`${fieldId}-description`}
            placeholder="Optional details."
            {...register("description")}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`${fieldId}-do-by-date`}>Do by</FieldLabel>
          <Input
            id={`${fieldId}-do-by-date`}
            type="datetime-local"
            {...register("doByDate")}
          />
        </Field>

        <FieldError errors={[errors.root]} />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : submitLabel}
          </Button>
          {onCancel ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </FieldGroup>
    </form>
  );
}
