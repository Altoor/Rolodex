import {
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "#components/ui/accordion";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Textarea } from "#components/ui/textarea";
import { useFormContext } from "react-hook-form";
import type { ToolTestInputs, ToolView } from "../tool-test-service";

interface ToolAdvancedOptionsProps {
  tool: ToolView;
}

const ToolAdvancedOptions = ({ tool }: ToolAdvancedOptionsProps) => {
  const {
    register,
    formState: { errors },
  } = useFormContext<ToolTestInputs>();

  return (
    <AccordionItem value="options">
      <AccordionTrigger>Advanced options</AccordionTrigger>
      <AccordionPanel className="pb-3">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor={`tool-${tool.key}-config`}>
              Tool config (JSON)
            </FieldLabel>
            <Textarea
              id={`tool-${tool.key}-config`}
              placeholder="Optional JSON object."
              {...register("toolConfig")}
            />
            <FieldDescription>
              Optional JSON object. The state above is also passed to the tool.
            </FieldDescription>
            <FieldError errors={[errors.toolConfig]} />
          </Field>

          <Field>
            <FieldLabel htmlFor={`tool-${tool.key}-state-json`}>
              Tool state (JSON)
            </FieldLabel>
            <Textarea
              id={`tool-${tool.key}-state-json`}
              placeholder="Optional JSON array of tool-state entries."
              {...register("toolState")}
            />
            <FieldDescription>
              Accumulated tool-state entries available to the tool.
            </FieldDescription>
            <FieldError errors={[errors.toolState]} />
          </Field>

          <Field>
            <FieldLabel htmlFor={`tool-${tool.key}-output-type`}>
              Output type (optional)
            </FieldLabel>
            <Input
              id={`tool-${tool.key}-output-type`}
              placeholder="normal"
              {...register("outputType")}
            />
            <FieldDescription>
              normal or foreach. Only tools that advertise foreach accept it.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={`tool-${tool.key}-model`}>
              Generation model (optional)
            </FieldLabel>
            <Input
              id={`tool-${tool.key}-model`}
              placeholder="Use your default generation model"
              {...register("model")}
            />
            <FieldDescription>
              Used by prompt-style tools. Leave blank to use your default
              generation model.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={`tool-${tool.key}-decision-model`}>
              Decision model (optional)
            </FieldLabel>
            <Input
              id={`tool-${tool.key}-decision-model`}
              placeholder="Use your default decision model"
              {...register("decisionModel")}
            />
            <FieldDescription>
              Used by decision tasks and todo selection. Leave blank to use your
              default decision model.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </AccordionPanel>
    </AccordionItem>
  );
};

export default ToolAdvancedOptions;
