import { asFiniteNumber } from "./numbers";

export function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;

  const leftNumber = asFiniteNumber(left);
  const rightNumber = asFiniteNumber(right);
  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber === rightNumber;
  }

  const leftDate = asDate(left);
  const rightDate = asDate(right);
  if (leftDate && rightDate) {
    return leftDate.getTime() === rightDate.getTime();
  }

  return false;
}

export function compareValues(
  left: unknown,
  right: unknown,
): { greater: boolean; smaller: boolean } | null {
  const leftNumber = asFiniteNumber(left);
  const rightNumber = asFiniteNumber(right);
  if (leftNumber !== null && rightNumber !== null) {
    return {
      greater: leftNumber > rightNumber,
      smaller: leftNumber < rightNumber,
    };
  }

  const leftDate = asDate(left);
  const rightDate = asDate(right);
  if (leftDate && rightDate) {
    return {
      greater: leftDate.getTime() > rightDate.getTime(),
      smaller: leftDate.getTime() < rightDate.getTime(),
    };
  }

  return null;
}
