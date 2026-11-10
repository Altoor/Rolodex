import { Accordion } from "#components/ui/accordion";
import { Button } from "#components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { useFormContext } from "react-hook-form";
import type { ToolTestInputs, ToolView } from "../tool-test-service";
import ToolAdvancedOptions from "./toolAdvancedOptions";
import ToolDetailsAccordion from "./toolDetailsAccordion";
import ToolStateField from "./toolStateField";

interface ToolTestFormProps {
  tool: ToolView;
  onSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>;
  loading: boolean;
  error: { message: string } | null | undefined;
}

const ToolTestForm = ({
  tool,
  onSubmit,
  loading,
  error,
}: ToolTestFormProps) => {
  const {
    formState: { errors },
  } = useFormContext<ToolTestInputs>();

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        <ToolStateField tool={tool} />

        <Accordion keepMounted>
          <ToolDetailsAccordion tool={tool} />
          <ToolAdvancedOptions tool={tool} />
        </Accordion>

        <Field>
          <FieldDescription>
            Running a tool can create, update, or delete real data.
          </FieldDescription>
          <Button type="submit" disabled={loading} className="w-fit">
            {loading ? <Spinner /> : "Run tool"}
          </Button>
          <FieldError
            errors={[
              errors.root,
              error ? { message: error.message } : undefined,
            ]}
          />
        </Field>
      </FieldGroup>
    </form>
  );
};

export default ToolTestForm;
