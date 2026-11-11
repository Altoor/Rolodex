import {
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "#components/ui/accordion";
import { ToolDetails } from "#components/tools/toolDetails";
import type { ToolView } from "../tool-test-service";

interface ToolDetailsAccordionProps {
  tool: ToolView;
}

const ToolDetailsAccordion = ({ tool }: ToolDetailsAccordionProps) => (
  <AccordionItem value="details">
    <AccordionTrigger>Tool details</AccordionTrigger>
    <AccordionPanel className="pb-3">
      <ToolDetails tool={tool} showDescription={false} />
    </AccordionPanel>
  </AccordionItem>
);

export default ToolDetailsAccordion;
