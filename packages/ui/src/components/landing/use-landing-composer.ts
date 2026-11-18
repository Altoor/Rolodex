"use client";

import { useMutation } from "@apollo/client/react";
import { CREATE_QUEUED_TASK } from "@repo/queries/tasks/task-mutations";
import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEventHandler,
} from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { FileUploadError, uploadFilesToServer } from "../files/file-actions";
import {
  stateFromAttachments,
  toStep,
  type LandingComposerState,
  type LandingFormInputs,
  type LandingTask,
  type QueuedTaskStep,
} from "./landing-model";
import { useAudioRecorder } from "./use-audio-recorder";

interface UseLandingComposerArgs {
  tasks: LandingTask[];
  tasksLoading: boolean;
  defaultTaskId: number | null;
  onTrackedStep: (step: QueuedTaskStep) => void;
  onOpenRun: (runId: string) => void;
}

/**
 * Owns the landing composer form, attachments, and upload-on-submit flow.
 * Queued steps are handed back to the caller so the run stream stays in one
 * place.
 */
export function useLandingComposer({
  tasks,
  tasksLoading,
  defaultTaskId,
  onTrackedStep,
  onOpenRun,
}: UseLandingComposerArgs) {
  const [createQueuedTask] = useMutation(CREATE_QUEUED_TASK);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<unknown>(null);

  const {
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { isSubmitting },
  } = useForm<LandingFormInputs>({
    defaultValues: { taskId: "-1", state: "" },
  });

  const addFiles = (files: File[]) => {
    setAttachError(null);
    setAttachments((previous) => [...previous, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((previous) =>
      previous.filter((_, fileIndex) => fileIndex !== index),
    );
  };

  const rejectDirectory = () => {
    setAttachError(
      new Error("Folder upload is not supported yet. Drop files instead."),
    );
  };

  const { recording, toggle: toggleRecording } = useAudioRecorder({
    onRecorded: (file) => {
      addFiles([file]);
    },
    onError: (message) => setAttachError(new Error(message)),
  });

  // Select the user's default task once the task list arrives, unless the
  // current selection is still valid.
  useEffect(() => {
    if (tasksLoading || tasks.length === 0) return;

    const currentTaskId = getValues("taskId");
    if (tasks.some((task) => String(task.id) === currentTaskId)) return;

    const preferredTaskId =
      defaultTaskId != null && tasks.some((task) => task.id === defaultTaskId)
        ? defaultTaskId
        : tasks[0]?.id;

    if (preferredTaskId != null) {
      reset({ ...getValues(), taskId: String(preferredTaskId) });
    }
  }, [tasksLoading, tasks, defaultTaskId, getValues, reset]);

  const onSubmit: SubmitHandler<LandingFormInputs> = async (inputs) => {
    setAttachError(null);

    try {
      const uploaded =
        attachments.length > 0
          ? await uploadFilesToServer(attachments, null)
          : [];

      const state = inputs.state.trim() || stateFromAttachments(attachments);

      const { data } = await createQueuedTask({
        variables: {
          taskId: parseInt(inputs.taskId, 10),
          state,
          fileIds: uploaded.map((entry) => entry.id),
        },
      });

      const step = data?.createQueuedTask
        ? toStep(data.createQueuedTask)
        : null;
      if (!step) return;

      // Show the new run immediately, before the processor emits its first
      // event.
      onTrackedStep(step);
      onOpenRun(step.runId);
      setAttachments([]);
      reset({ state: "", taskId: inputs.taskId });
    } catch (error) {
      setAttachError(
        error instanceof FileUploadError && error.uploaded.length > 0
          ? new Error(
              `${error.message} The files that finished uploading are in your files page.`,
            )
          : error,
      );
    }
  };

  const submit = (event?: FormEvent<HTMLFormElement>) => {
    if (recording || isSubmitting) return;
    void handleSubmit(onSubmit)(event);
  };

  // Enter submits, Shift+Enter inserts a newline.
  const onKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const state: LandingComposerState = {
    control,
    submit,
    onKeyDown,
    attachments,
    recording,
    isSubmitting,
    attachError,
    addFiles,
    removeAttachment,
    rejectDirectory,
    toggleRecording,
  };

  return state;
}
