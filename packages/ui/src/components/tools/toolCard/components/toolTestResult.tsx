import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "#components/ui/accordion";
import { Block } from "#components/blocks/block";
import type { TestToolMutation } from "@repo/queries/__generated__/graphql";
import type { ToolView } from "../tool-test-service";

type ToolTestResultData = NonNullable<TestToolMutation["testTool"]>;

interface ToolTestResultProps {
  tool: ToolView;
  result: ToolTestResultData | null | undefined;
}

const ToolTestResult = ({ tool, result }: ToolTestResultProps) => {
  if (!result) return null;

  return (
    <Accordion
      key={`${result.summary}:${JSON.stringify(result.output)}`}
      defaultValue={["result"]}
    >
      <AccordionItem value="result">
        <AccordionTrigger>Result</AccordionTrigger>
        <AccordionPanel className="flex flex-col gap-2 pb-3">
          <p className="text-sm text-muted-foreground">{result.summary}</p>
          <Block toolKey={tool.key} output={result.output} />
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium">Resulting state</p>
            <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
              {result.state}
            </pre>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium">Resulting tool state</p>
            <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
              {JSON.stringify(result.toolState, null, 2)}
            </pre>
          </div>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};

export default ToolTestResult;
