"use client";

import { useMutation } from "@apollo/client/react";
import {
  CREATE_USER_DECISION_OPTION,
  DELETE_USER_DECISION_OPTION,
  UPDATE_USER_DECISION_OPTION,
} from "@repo/queries/tasks/task-mutations";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { Button } from "#components/ui/button";
import { Checkbox } from "#components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Item, ItemActions, ItemContent } from "#components/ui/item";
import {
  Select,
  SelectContent,
  SelectController,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { Textarea } from "#components/ui/textarea";
import { ErrorState } from "#components/feedback/error-state";
import { Plus, Save, X } from "lucide-react";
import {
  relativePathsForSelector,
  selectorPathFromText,
  suggestionsForConfig,
  type ToolStatePathSuggestion,
} from "#lib/toolStatePaths";
import { useMemo, useState } from "react";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { NO_BRANCH_TASK, type TaskFormValues } from "../../task-form";
import PathFormField from "../../toolStatePaths/pathFormField";
import { buildUserDecisionOptionVariables } from "../task-builder-service";

interface TaskOption {
  id: number;
  name: string;
}

interface UserDecisionSectionProps {
  taskId: number | undefined;
  tasks: TaskOption[];
  pathSuggestions: ToolStatePathSuggestion[];
}

const emptyStaticOption = (sortOrder: number) => ({
  id: null,
  kind: "static" as const,
  label: "",
  description: "",
  value: "",
  selectorText: "",
  labelPath: "",
  descriptionPath: "",
  valuePath: "",
  resultTaskId: null,
  appendState: false,
  sortOrder,
});

const emptyDynamicOption = (sortOrder: number) => ({
  ...emptyStaticOption(sortOrder),
  kind: "dynamic" as const,
  selectorText: `{\n  "mode": "whitelist",\n  "path": "todos",\n  "where": { "has": { "path": "id" } }\n}`,
  labelPath: "name",
  descriptionPath: "description",
  valuePath: "id",
  appendState: true,
});

const UserDecisionOptionEditor = ({
  index,
  tasks,
  pathSuggestions,
  onSave,
  onDelete,
  canEdit,
}: {
  index: number;
  tasks: TaskOption[];
  pathSuggestions: ToolStatePathSuggestion[];
  onSave: () => void;
  onDelete: () => void;
  canEdit: boolean;
}) => {
  const { register, control } = useFormContext<TaskFormValues>();
  const kind = useWatch({
    control,
    name: `userDecisionOptions.${index}.kind`,
  });
  const selectorText = useWatch({
    control,
    name: `userDecisionOptions.${index}.selectorText`,
  });

  const selectorSuggestions = useMemo(
    () => suggestionsForConfig(pathSuggestions, selectorText ?? ""),
    [pathSuggestions, selectorText],
  );
  const itemSuggestions = useMemo(
    () => relativePathsForSelector(pathSuggestions, selectorText ?? ""),
    [pathSuggestions, selectorText],
  );
  const selectorPath = selectorPathFromText(selectorText ?? "");

  return (
    <Item variant="outline" className="relative w-full max-w-80">
      <button
        type="button"
        className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        title="Remove option"
        aria-label="Remove option"
      >
        <X className="size-4" />
      </button>
      <ItemContent>
        <FieldGroup>
          <Field>
            <FieldLabel>Kind</FieldLabel>
            <SelectController
              name={`userDecisionOptions.${index}.kind`}
              control={control}
            >
              {(value, onChange) => (
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="static">Static option</SelectItem>
                      <SelectItem value="dynamic">Dynamic source</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </SelectController>
          </Field>

          {kind === "static" ? (
            <>
              <Field>
                <FieldLabel>Label</FieldLabel>
                <Input
                  {...register(`userDecisionOptions.${index}.label`)}
                  placeholder="Buy gift"
                />
              </Field>
              <Field>
                <FieldLabel>Value</FieldLabel>
                <Input
                  {...register(`userDecisionOptions.${index}.value`)}
                  placeholder="buy-gift"
                />
              </Field>
              <Field>
                <FieldLabel>Description</FieldLabel>
                <Textarea
                  {...register(`userDecisionOptions.${index}.description`)}
                />
              </Field>
            </>
          ) : (
            <>
              <PathFormField
                name={`userDecisionOptions.${index}.selectorText`}
                label="Selector"
                suggestions={selectorSuggestions}
                textarea
                className="min-h-40 font-mono text-xs"
                description="Path and where values can use earlier tool-state paths."
                emptyHint="No earlier tasks in this flow add tool-state values yet."
              />
              <div className="grid grid-cols-2 gap-2">
                <PathFormField
                  name={`userDecisionOptions.${index}.labelPath`}
                  label="Label path"
                  suggestions={itemSuggestions}
                  placeholder="name"
                  emptyHint="Set the selector path to see item-relative fields."
                />
                <PathFormField
                  name={`userDecisionOptions.${index}.valuePath`}
                  label="Value path"
                  suggestions={itemSuggestions}
                  placeholder="id"
                  emptyHint="Set the selector path to see item-relative fields."
                />
              </div>
              <PathFormField
                name={`userDecisionOptions.${index}.descriptionPath`}
                label="Description path"
                suggestions={itemSuggestions}
                placeholder="description"
                emptyHint="Set the selector path to see item-relative fields."
              />
            </>
          )}

          <Field>
            <FieldLabel>After selection</FieldLabel>
            <Controller
              control={control}
              name={`userDecisionOptions.${index}.resultTaskId`}
              render={({ field }) => (
                <Select
                  value={
                    field.value != null ? String(field.value) : NO_BRANCH_TASK
                  }
                  onValueChange={(value) =>
                    field.onChange(
                      value === NO_BRANCH_TASK ? null : Number(value),
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={NO_BRANCH_TASK}>Stop run</SelectItem>
                      {tasks.map((task) => (
                        <SelectItem key={task.id} value={String(task.id)}>
                          {task.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field orientation="horizontal">
            <Controller
              control={control}
              name={`userDecisionOptions.${index}.appendState`}
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) =>
                    field.onChange(checked === true)
                  }
                />
              )}
            />
            <FieldLabel>Append selection to tool state</FieldLabel>
          </Field>
          {kind === "dynamic" && selectorPath ? (
            <FieldDescription>
              Dynamic item selections are always appended so the chosen item
              reaches the next task.
            </FieldDescription>
          ) : null}

          <Field>
            <FieldLabel>Sort order</FieldLabel>
            <Input
              type="number"
              {...register(`userDecisionOptions.${index}.sortOrder`, {
                valueAsNumber: true,
              })}
            />
          </Field>

          <Button
            type="button"
            variant="outline"
            className="w-min"
            disabled={!canEdit}
            onClick={onSave}
          >
            Save <Save />
          </Button>
        </FieldGroup>
      </ItemContent>
      <ItemActions />
    </Item>
  );
};

const UserDecisionSection = ({
  taskId,
  tasks,
  pathSuggestions,
}: UserDecisionSectionProps) => {
  const { control, getValues, register, setValue } =
    useFormContext<TaskFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "userDecisionOptions",
  });
  const userDecisionType = useWatch({
    control,
    name: "userDecisionType",
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const [createOption, { error: createError }] = useMutation(
    CREATE_USER_DECISION_OPTION,
    { refetchQueries: [TASKS] },
  );
  const [updateOption, { error: updateError }] = useMutation(
    UPDATE_USER_DECISION_OPTION,
    { refetchQueries: [TASKS] },
  );
  const [deleteOption, { error: deleteError }] = useMutation(
    DELETE_USER_DECISION_OPTION,
    { refetchQueries: [TASKS] },
  );

  const canEdit = taskId != null;

  const saveOption = async (index: number) => {
    if (taskId == null) return;
    setLocalError(null);

    try {
      const option = getValues(`userDecisionOptions.${index}`);
      const variables = buildUserDecisionOptionVariables(option, taskId);

      if (option.id != null) {
        await updateOption({ variables: { ...variables, id: option.id } });
        return;
      }

      const { data } = await createOption({ variables });
      const createdId = data?.createUserDecisionOption?.id;
      if (createdId != null) {
        setValue(`userDecisionOptions.${index}.id`, createdId);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  const deleteOptionAt = async (index: number) => {
    const option = getValues(`userDecisionOptions.${index}`);
    if (option.id != null) {
      await deleteOption({ variables: { id: option.id } });
    }
    remove(index);
  };

  const addOption = (kind: "static" | "dynamic") => {
    append(
      kind === "static"
        ? emptyStaticOption(fields.length)
        : emptyDynamicOption(fields.length),
    );
  };

  const error = createError ?? updateError ?? deleteError ?? localError;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">User decision</p>
        <Field>
          <FieldLabel>Choice type</FieldLabel>
          <SelectController
            name="userDecisionType"
            control={control}
            defaultValue="list"
          >
            {(value, onChange) => (
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="yesNo">Yes / No</SelectItem>
                    <SelectItem value="list">Select from list</SelectItem>
                    <SelectItem value="dropdown">
                      Select from dropdown
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </SelectController>
        </Field>

        <Field>
          <FieldLabel>Prompt</FieldLabel>
          <Input
            {...register("userDecisionConfig.prompt")}
            placeholder="Which option should I use?"
          />
        </Field>

        <Field>
          <FieldLabel>Accept label</FieldLabel>
          <Input
            {...register("userDecisionConfig.acceptLabel")}
            placeholder="Accept"
          />
        </Field>

        {userDecisionType === "yesNo" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel>Yes wording</FieldLabel>
                <Input {...register("userDecisionConfig.yesLabel")} />
              </Field>
              <Field>
                <FieldLabel>No wording</FieldLabel>
                <Input {...register("userDecisionConfig.noLabel")} />
              </Field>
            </div>
            <p className="text-sm text-muted-foreground">
              Yes/No always produces two buttons. Add static options with the
              values “yes” and “no” to choose where each answer continues.
            </p>
          </>
        ) : null}
      </div>

      {error ? (
        <ErrorState title="Could not save option" error={error} />
      ) : null}

      {!canEdit ? (
        <p className="text-sm text-muted-foreground">
          Save the task before adding options.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {fields.map((field, index) => (
              <UserDecisionOptionEditor
                key={field.id}
                index={index}
                tasks={tasks}
                pathSuggestions={pathSuggestions}
                canEdit={canEdit}
                onSave={() => void saveOption(index)}
                onDelete={() => void deleteOptionAt(index)}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-min"
              onClick={() => addOption("static")}
            >
              Add option <Plus />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-min"
              onClick={() => addOption("dynamic")}
            >
              Add dynamic source <Plus />
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default UserDecisionSection;
