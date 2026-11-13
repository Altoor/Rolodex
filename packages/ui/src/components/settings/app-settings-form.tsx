"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { UPDATE_APP_SETTINGS } from "@repo/queries/settings/app-settings-mutations";
import { APP_SETTINGS } from "@repo/queries/settings/app-settings-queries";
import { Button } from "#components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { Spinner } from "#components/ui/spinner";

export interface AppSettingsValues {
  ollamaBaseUrl: string;
  transcriberBackend: "whisper_cpp" | "faster_whisper";
  whisperApiUrl: string;
  whisperModel: string | null;
}

interface AppSettingsFormProps {
  initial: AppSettingsValues;
  onSaved?: () => void;
  onDirty?: () => void;
}

export function AppSettingsForm({
  initial,
  onSaved,
  onDirty,
}: AppSettingsFormProps) {
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(initial.ollamaBaseUrl);
  const [transcriberBackend, setTranscriberBackend] = useState<
    AppSettingsValues["transcriberBackend"]
  >(initial.transcriberBackend);
  const [whisperApiUrl, setWhisperApiUrl] = useState(initial.whisperApiUrl);
  const [whisperModel, setWhisperModel] = useState(initial.whisperModel ?? "");

  const [updateSettings, { loading: saving, error: saveError }] = useMutation(
    UPDATE_APP_SETTINGS,
    { refetchQueries: [APP_SETTINGS] },
  );

  const save = async () => {
    const { error } = await updateSettings({
      variables: {
        ollamaBaseUrl,
        transcriberBackend,
        whisperApiUrl,
        whisperModel: whisperModel.trim() || null,
      },
    });

    if (!error) onSaved?.();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Services</CardTitle>
        <CardDescription>
          Endpoints shared by every user on this installation.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Field>
          <FieldLabel htmlFor="ollama-base-url">Ollama API URL</FieldLabel>
          <Input
            id="ollama-base-url"
            value={ollamaBaseUrl}
            placeholder="http://127.0.0.1:11434"
            onChange={(event) => {
              setOllamaBaseUrl(event.target.value);
              onDirty?.();
            }}
            disabled={saving}
          />
          <FieldDescription>
            Base URL used by prompts, embeddings, and decision models. Point this
            at a remote Ollama instance if you do not run one locally.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="transcriber-backend">
            Whisper backend
          </FieldLabel>
          <Select
            value={transcriberBackend}
            onValueChange={(value) => {
              setTranscriberBackend(
                (value ?? "faster_whisper") as AppSettingsValues["transcriberBackend"],
              );
              onDirty?.();
            }}
            disabled={saving}
          >
            <SelectTrigger id="transcriber-backend" className="w-full">
              <SelectValue placeholder="Choose a backend" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="faster_whisper">
                  faster-whisper (OpenAI-compatible)
                </SelectItem>
                <SelectItem value="whisper_cpp">
                  whisper.cpp (/asr)
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Select the request shape used by your Whisper service. The bundled
            container uses faster-whisper.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="whisper-api-url">Whisper API URL</FieldLabel>
          <Input
            id="whisper-api-url"
            value={whisperApiUrl}
            placeholder="http://127.0.0.1:9000/v1/audio/transcriptions"
            onChange={(event) => {
              setWhisperApiUrl(event.target.value);
              onDirty?.();
            }}
            disabled={saving}
          />
          <FieldDescription>
            Full transcription endpoint. Use
            {" "}
            <code>/v1/audio/transcriptions</code> for faster-whisper or
            {" "}
            <code>/asr</code> for a whisper.cpp service.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="whisper-model">Whisper model</FieldLabel>
          <Input
            id="whisper-model"
            value={whisperModel}
            placeholder="Optional, for example large-v3-turbo"
            onChange={(event) => {
              setWhisperModel(event.target.value);
              onDirty?.();
            }}
            disabled={saving}
          />
          <FieldDescription>
            Optional model name sent with faster-whisper requests. External
            services may ignore it.
          </FieldDescription>
        </Field>

        {saveError ? (
          <p className="text-sm text-destructive" role="alert">
            {saveError.message}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Spinner /> : null}
          Save settings
        </Button>
      </CardFooter>
    </Card>
  );
}
