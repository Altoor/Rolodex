"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { UPDATE_APP_SETTINGS } from "@repo/queries/settings/app-settings-mutations";
import { APP_SETTINGS } from "@repo/queries/settings/app-settings-queries";
import { Button } from "#components/ui/button";
import { Checkbox } from "#components/ui/checkbox";
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
  maxParallelTasks: number;
  ollamaKeepAlive: string | null;
  preloadModels: boolean;
  warmModelsOnStartup: boolean;
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
  const [maxParallelTasks, setMaxParallelTasks] = useState(
    String(initial.maxParallelTasks),
  );
  const [ollamaKeepAlive, setOllamaKeepAlive] = useState(
    initial.ollamaKeepAlive ?? "",
  );
  const [preloadModels, setPreloadModels] = useState(initial.preloadModels);
  const [warmModelsOnStartup, setWarmModelsOnStartup] = useState(
    initial.warmModelsOnStartup,
  );

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
        maxParallelTasks: Number(maxParallelTasks),
        ollamaKeepAlive: ollamaKeepAlive.trim() || null,
        preloadModels,
        warmModelsOnStartup,
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
            Base URL used by prompts, embeddings, and decision models. Point
            this at a remote Ollama instance if you do not run one locally.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="ollama-keep-alive">Ollama keep-alive</FieldLabel>
          <Input
            id="ollama-keep-alive"
            value={ollamaKeepAlive}
            placeholder="Leave empty to use the Ollama server setting"
            onChange={(event) => {
              setOllamaKeepAlive(event.target.value);
              onDirty?.();
            }}
            disabled={saving}
          />
          <FieldDescription>
            How long Ollama keeps a model in memory after a request, for example
            <code>30m</code> or <code>1h</code>. Leave empty to use the server's
            own <code>OLLAMA_KEEP_ALIVE</code> value; the bundled compose files
            set 30m. Use <code>-1</code> to keep models loaded until Ollama
            needs the memory.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="transcriber-backend">Whisper backend</FieldLabel>
          <Select
            value={transcriberBackend}
            onValueChange={(value) => {
              setTranscriberBackend(
                (value ??
                  "faster_whisper") as AppSettingsValues["transcriberBackend"],
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
                <SelectItem value="whisper_cpp">whisper.cpp (/asr)</SelectItem>
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
            Full transcription endpoint. Use{" "}
            <code>/v1/audio/transcriptions</code> for faster-whisper or{" "}
            <code>/asr</code> for a whisper.cpp service.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="whisper-model">Whisper model</FieldLabel>
          <Input
            id="whisper-model"
            value={whisperModel}
            placeholder="Optional, for example Systran/faster-whisper-large-v3"
            onChange={(event) => {
              setWhisperModel(event.target.value);
              onDirty?.();
            }}
            disabled={saving}
          />
          <FieldDescription>
            Optional HuggingFace CTranslate2 model id sent with faster-whisper
            requests. The model must already be downloaded on the server; other
            services may ignore it.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="max-parallel-tasks">
            Maximum parallel tasks
          </FieldLabel>
          <Input
            id="max-parallel-tasks"
            type="number"
            min={1}
            max={50}
            value={maxParallelTasks}
            onChange={(event) => {
              setMaxParallelTasks(event.target.value);
              onDirty?.();
            }}
            disabled={saving}
          />
          <FieldDescription>
            How many parallel-capable queue steps may run at the same time.
            Defaults to 5. Steps marked not parallel always run alone, after the
            available parallel work drains.
          </FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id="preload-models"
            checked={preloadModels}
            onCheckedChange={(checked) => {
              setPreloadModels(checked === true);
              onDirty?.();
            }}
            disabled={saving}
          />
          <div className="flex flex-col gap-0.5">
            <FieldLabel htmlFor="preload-models">
              Preload models before they run
            </FieldLabel>
            <FieldDescription>
              Load a model as soon as a queued step that needs it is added, and
              while the queue waits for earlier work. This avoids first-request
              timeouts for large vision models.
            </FieldDescription>
          </div>
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id="warm-models-on-startup"
            checked={warmModelsOnStartup}
            onCheckedChange={(checked) => {
              setWarmModelsOnStartup(checked === true);
              onDirty?.();
            }}
            disabled={saving || !preloadModels}
          />
          <div className="flex flex-col gap-0.5">
            <FieldLabel htmlFor="warm-models-on-startup">
              Preload configured models on startup
            </FieldLabel>
            <FieldDescription>
              Warms the configured generation, decision, and vision models once
              after the backend starts. Keep this off if VRAM is limited or the
              Ollama instance is shared.
            </FieldDescription>
          </div>
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
