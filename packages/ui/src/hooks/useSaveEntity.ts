import type { FieldValues, UseFormReturn } from "react-hook-form";

export type SaveAction<Variables, Data = unknown> = (
  variables: Variables,
) => Promise<{ data?: Data | null | undefined }>;

interface UseSaveEntityOptions<
  Values extends FieldValues,
  Variables,
  CreateData,
> {
  form: UseFormReturn<Values>;
  /** Existing entity id; when undefined the create action is used. */
  id: number | undefined;
  /** Maps form values to mutation variables. May throw a validation error. */
  toVariables: (values: Values) => Variables;
  create: SaveAction<Variables, CreateData>;
  update: SaveAction<Variables & { id: number }>;
  onCreated?: (data: CreateData | null | undefined, values: Values) => void;
  onBuildError?: (error: unknown) => void;
}

/**
 * Creates or updates an entity from a react-hook-form form. Create and update
 * differ only by the presence of an id, so both builders share this flow.
 */
export function useSaveEntity<
  Values extends FieldValues,
  Variables,
  CreateData = unknown,
>({
  form,
  id,
  toVariables,
  create,
  update,
  onCreated,
  onBuildError,
}: UseSaveEntityOptions<Values, Variables, CreateData>) {
  return form.handleSubmit(async (values) => {
    let variables: Variables;

    try {
      variables = toVariables(values);
    } catch (error) {
      onBuildError?.(error);
      return;
    }

    if (id !== undefined) {
      await update({ ...variables, id });
      return;
    }

    const { data } = await create(variables);
    onCreated?.(data, values);
  });
}
