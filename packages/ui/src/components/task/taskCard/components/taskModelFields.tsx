import ModelSelectField from "./modelSelectField";

interface TaskModelFieldsProps {
  models: string[];
}

const TaskModelFields = ({ models }: TaskModelFieldsProps) => (
  <div className="grid gap-4 sm:grid-cols-2">
    <ModelSelectField
      name="model"
      label="Generation model"
      description="Used by the prompt tool and todo field extraction."
      models={models}
    />
    <ModelSelectField
      name="decisionModel"
      label="Decision model"
      description="Used by decision tasks and todo selection."
      models={models}
    />
  </div>
);

export default TaskModelFields;
