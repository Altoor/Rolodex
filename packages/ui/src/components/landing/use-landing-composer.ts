"use client";

import { useMutation } from "@apollo/client/react";
import { CREATE_QUEUED_TASK } from "@repo/queries/tasks/task-mutations";
import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEventHandler,
  type MutableRefObject,
} from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { FileUploadError, uploadFilesToServer } from "../files/file-actions";
import { START_ASSISTED_RUN } from "../assisted";
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
  autoImprovement: boolean;
  resetRef: MutableRefObject<() => void>;
  onTrackedStep: (step: QueuedTaskStep) => void;
  onOpenRun: (runId: string) => void;
  onAssistedStarted: (runId: string) => void;
}

/**
 * Owns the landing composer form, attachments, and upload-on-submit flow.
 * Submitted runs are handed back to the caller so the run stream stays in one
 * place.
 */
export function useLandingComposer({
  tasks,
  tasksLoading,
  defaultTaskId,
  autoImprovement,
  resetRef,
  onTrackedStep,
  onOpenRun,
  onAssistedStarted,
}: UseLandingComposerArgs) {
  const [createQueuedTask] = useMutation(CREATE_QUEUED_TASK);
  const [startAssistedRun] = useMutation(START_ASSISTED_RUN);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<unknown>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

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
    if (tasksLoading) return;

    const currentTaskId = getValues("taskId");
    const currentIsValid = tasks.some(
      (task) => String(task.id) === currentTaskId,
    );
    if (currentIsValid) return;

    if (tasks.length === 0) {
      reset({ ...getValues(), taskId: "" });
      return;
    }

    const preferredTaskId =
      defaultTaskId != null && tasks.some((task) => task.id === defaultTaskId)
        ? defaultTaskId
        : null;

    reset({
      ...getValues(),
      taskId: String(preferredTaskId ?? tasks[0]?.id),
    });
  }, [tasksLoading, tasks, defaultTaskId, getValues, reset]);

  useEffect(() => {
    resetRef.current = () => {
      setAttachments([]);
      setAttachError(null);
      setSubmitError(null);
      reset({ state: "", taskId: getValues("taskId") });
    };
  }, [resetRef, reset, getValues]);

  const onSubmit: SubmitHandler<LandingFormInputs> = async (inputs) => {
    setAttachError(null);
    setSubmitError(null);

    const taskId = parseInt(inputs.taskId, 10);
    if (!Number.isFinite(taskId)) {
      setSubmitError(new Error("Choose a starting task."));
      return;
    }

    try {
      const uploaded =
        attachments.length > 0
          ? await uploadFilesToServer(attachments, null)
          : [];

      const state = inputs.state.trim() || stateFromAttachments(attachments);
      const fileIds = uploaded.map((entry) => entry.id);

      if (autoImprovement) {
        const { data } = await startAssistedRun({
          variables: { input: { taskId, state, fileIds } },
        });
        const runId = (data as { startAssistedRun?: { id?: string } } | undefined)
          ?.startAssistedRun?.id;
        if (runId) onAssistedStarted(runId);
        setAttachments([]);
        reset({ state: "", taskId: inputs.taskId });
        return;
      }

      const { data } = await createQueuedTask({
        variables: { taskId, state, fileIds },
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
      setSubmitError(
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
    submitError,
    addFiles,
    removeAttachment,
    rejectDirectory,
    toggleRecording,
  };

  return state;
}
