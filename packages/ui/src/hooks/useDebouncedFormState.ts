import { useCallback, useEffect, useRef } from "react";
import {
  useForm,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";
import { debounce } from "#lib/debounce";

export interface UseDebouncedFormStateOptions<T extends FieldValues> {
  /** Which form fields to watch for changes */
  fieldsToWatch: Array<keyof T>;
  /**
   * Given the current values of the watched fields, return the values object
   * to pass to setValues. The second parameter is a function that returns all
   * current form values (useful for reading unwatched fields).
   */
  valuesFromFields: (
    watched: Record<string, unknown>,
    getValues: () => T,
  ) => Record<string, unknown>;
  /** External values to sync into the form (reset trigger) */
  values: Record<string, unknown> | undefined;
  /** Callback to update parent state with merged values */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValues: (values: any) => void;
  /** Debounce delay in ms (default: 500) */
  delay?: number;
}

export function useDebouncedFormState<T extends FieldValues>(
  options: UseDebouncedFormStateOptions<T>,
): UseFormReturn<T> {
  const {
    fieldsToWatch,
    valuesFromFields,
    values,
    setValues,
    delay = 500,
  } = options;

  const form = useForm<T>();
  const { register, reset, watch, getValues } = form;

  // Keep refs in sync to avoid stale closures in the debounce
  const valuesRef = useRef(values);
  const setValuesRef = useRef(setValues);
  const valuesFromFieldsRef = useRef(valuesFromFields);

  valuesRef.current = values;
  setValuesRef.current = setValues;
  valuesFromFieldsRef.current = valuesFromFields;

  // Reset form when parent values change
  useEffect(() => {
    if (values !== undefined) {
      reset(values as T);
    }
  }, [values, reset]);

  // Debounced setter
  const debouncedSetValues = useCallback(
    (watched: Record<string, unknown>) => {
      debounce(() => {
        const merged = valuesFromFieldsRef.current(watched, getValues);
        setValuesRef.current(merged);
      }, delay)();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Watch form fields and debounce updates
  useEffect(() => {
    const { unsubscribe } = watch((watchedValues) => {
      // Build a simple record of the watched fields
      const record: Record<string, unknown> = {};
      for (const field of fieldsToWatch) {
        record[String(field)] = (watchedValues as Record<string, unknown>)[
          String(field)
        ];
      }
      debouncedSetValues(record);
    });
    return () => unsubscribe();
  }, [watch, debouncedSetValues, fieldsToWatch]);

  return form;
}
