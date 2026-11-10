import { useMutation } from "@apollo/client/react";
import { TEST_TOOL } from "@repo/queries/tools/tool-mutations";

/** Owns the testTool mutation and its loading/error state. */
export function useToolTest() {
  const [testTool, { data, error, loading }] = useMutation(TEST_TOOL);

  return { testTool, data, error, loading };
}
