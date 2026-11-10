import { Save } from "lucide-react";
import { Button } from "#components/ui/button";
import { Spinner } from "#components/ui/spinner";

interface SaveTaskButtonProps {
  save: () => void;
  saving: boolean;
}

const SaveTaskButton = ({ save, saving }: SaveTaskButtonProps) => (
  <Button
    type="button"
    onClick={save}
    disabled={saving}
    title="Save task"
    aria-label="Save task"
  >
    {saving ? <Spinner /> : <Save />}
  </Button>
);

export default SaveTaskButton;
