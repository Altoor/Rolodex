import { Badge } from "#components/ui/badge";
import {
  CardDescription,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import type { ToolView } from "../tool-test-service";

interface ToolCardHeaderProps {
  tool: ToolView;
}

const ToolCardHeader = ({ tool }: ToolCardHeaderProps) => (
  <CardHeader>
    <div className="flex flex-wrap items-center gap-2">
      <CardTitle>{tool.name ?? "Unnamed tool"}</CardTitle>
      <Badge variant="secondary">{tool.key}</Badge>
      <Badge variant="outline">{tool.category}</Badge>
    </div>
    <CardDescription>{tool.description}</CardDescription>
  </CardHeader>
);

export default ToolCardHeader;
