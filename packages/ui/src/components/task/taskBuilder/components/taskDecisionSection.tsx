import DecisionBuilder from "#components/decision/decisionBuilder";
import DecisionList from "#components/decision/decisionList/decisionList";
import { Button } from "#components/ui/button";
import { Pencil } from "lucide-react";
import type { TaskType } from "@repo/queries/__generated__/graphql";

interface TaskDecisionSectionProps {
  type: TaskType;
  selectedDecisionId: number | undefined;
  onSelectDecision: (id: number | undefined) => void;
}

const TaskDecisionSection = ({
  type,
  selectedDecisionId,
  onSelectDecision,
}: TaskDecisionSectionProps) => {
  if (type !== "decision") return null;

  if (selectedDecisionId !== undefined) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={() => onSelectDecision(undefined)}
        >
          Select another decision <Pencil />
        </Button>
        <DecisionBuilder selectedDecisionId={selectedDecisionId} />
      </>
    );
  }

  return (
    <>
      <DecisionList
        selectedDecisionId={undefined}
        setSelectedDecisionId={onSelectDecision}
      />
      <DecisionBuilder selectedDecisionId={undefined} />
    </>
  );
};

export default TaskDecisionSection;
