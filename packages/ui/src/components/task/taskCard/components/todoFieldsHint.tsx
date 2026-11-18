import { FieldDescription } from "#components/ui/field";
import type { ToolStatePathSuggestion } from "#lib/toolStatePaths";

const TODO_FIELDS = [
  "name",
  "description",
  "doByDate",
  "date",
  "dueDate",
  "done",
];

interface TodoFieldsHintProps {
  suggestions: ToolStatePathSuggestion[];
  mode: "create" | "update";
}

export function TodoFieldsHint({ suggestions, mode }: TodoFieldsHintProps) {
  const available = TODO_FIELDS.filter((path) =>
    suggestions.some((suggestion) => suggestion.path === path),
  );

  return (
    <FieldDescription>
      {mode === "create" ? (
        <>
          Reads <code className="font-mono">name</code>,{" "}
          <code className="font-mono">description</code>,{" "}
          <code className="font-mono">doByDate</code> (or{" "}
          <code className="font-mono">date</code>), and{" "}
          <code className="font-mono">done</code> from earlier toolState. A
          prompt task with matching fields can feed this automatically—leave
          this config empty unless you want to supply defaults such as{" "}
          <code className="font-mono">done</code>.
        </>
      ) : (
        <>
          Updates only the fields you provide. Put a selector such as{" "}
          <code className="font-mono">id</code> in this config, or place a{" "}
          <code className="font-mono">find_todo</code> task before this one. A
          prompt task with <code className="font-mono">description</code>,{" "}
          <code className="font-mono">doByDate</code>, or{" "}
          <code className="font-mono">done</code> fields feeds the update
          automatically; a <code className="font-mono">name</code> field will
          rename the todo.
        </>
      )}
      {available.length > 0 ? (
        <>
          {" "}
          Available now:{" "}
          {available.map((path, index) => (
            <span key={path}>
              {index > 0 ? ", " : null}
              <code className="font-mono">{path}</code>
            </span>
          ))}
          .
        </>
      ) : null}
    </FieldDescription>
  );
}
