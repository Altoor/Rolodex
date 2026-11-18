"use client";

import { useEffect, useRef, useState } from "react";

interface UseAudioRecorderOptions {
  onRecorded: (file: File) => void;
  onError: (message: string) => void;
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * The backend classifies files by extension first, so audio needs an audio
 * extension even when the browser reports a video-capable container such as
 * WebM.
 */
function recordingExtension(mimeType: string): string {
  if (mimeType.includes("ogg")) return "oga";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("webm")) return "weba";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "weba";
}

function recordingName(mimeType: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
  return `recording-${stamp}.${recordingExtension(mimeType)}`;
}

function microphoneErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Microphone access was denied.";
    }
    if (error.name === "NotFoundError") {
      return "No microphone was found.";
    }
  }

  return error instanceof Error ? error.message : "Could not start recording.";
}

/** Records one microphone clip at a time and hands it back as a File. */
export function useAudioRecorder({
  onRecorded,
  onError,
}: UseAudioRecorderOptions) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef(false);

  const start = async () => {
    if (recording || startingRef.current) return;

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      onError("Audio recording is not supported in this browser.");
      return;
    }

    startingRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });

        chunksRef.current = [];
        recorderRef.current = null;
        stopStream(streamRef.current);
        streamRef.current = null;
        setRecording(false);

        if (blob.size > 0) {
          onRecorded(
            new File([blob], recordingName(mimeType), { type: mimeType }),
          );
        } else {
          onError("No audio was captured. Try recording a little longer.");
        }
      };

      recorder.onerror = () => {
        recorderRef.current = null;
        stopStream(streamRef.current);
        streamRef.current = null;
        setRecording(false);
        onError("Recording failed. Try again.");
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (error) {
      stopStream(streamRef.current);
      streamRef.current = null;
      onError(microphoneErrorMessage(error));
    } finally {
      startingRef.current = false;
    }
  };

  const stop = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      stopStream(streamRef.current);
      streamRef.current = null;
      setRecording(false);
      return;
    }

    recorder.stop();
  };

  const toggle = () => {
    if (recording) stop();
    else void start();
  };

  // Releasing the microphone on unmount also stops an in-flight recording.
  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      recorderRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
    },
    [],
  );

  return { recording, toggle };
}
