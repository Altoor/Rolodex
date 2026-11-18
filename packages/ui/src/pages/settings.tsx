"use client";

import { useState } from "react";
import { useQuery } from "@apollo/client/react";
import { APP_SETTINGS } from "@repo/queries/settings/app-settings-queries";
import { AuthGate } from "../components/auth/auth-gate";
import { ErrorState } from "#components/feedback/error-state";
import { LoadingState } from "#components/feedback/loading-state";
import { PageContainer } from "#components/layout/page-container";
import { PageHeader } from "#components/layout/page-header";
import { AppSettingsForm } from "#components/settings/app-settings-form";

export default function SettingsPage() {
  return (
    <AuthGate>
      <SettingsPageContent />
    </AuthGate>
  );
}

function SettingsPageContent() {
  const [saved, setSaved] = useState(false);
  const { data, loading, error, refetch } = useQuery(APP_SETTINGS, {
    fetchPolicy: "cache-and-network",
  });

  if (loading && !data) {
    return (
      <PageContainer>
        <LoadingState label="Loading settings…" />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          title="Could not load settings"
          error={error}
          onRetry={() => void refetch()}
        />
      </PageContainer>
    );
  }

  const settings = data?.appSettings;

  if (!settings) {
    return (
      <PageContainer>
        <ErrorState
          title="Could not load settings"
          error={new Error("No settings returned")}
          onRetry={() => void refetch()}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        description="Configure the Ollama and Whisper services used by this installation."
      />

      <AppSettingsForm
        key={settings.updatedAt ? String(settings.updatedAt) : "defaults"}
        initial={{
          ollamaBaseUrl: settings.ollamaBaseUrl ?? "",
          transcriberBackend:
            settings.transcriberBackend === "whisper_cpp"
              ? "whisper_cpp"
              : "faster_whisper",
          whisperApiUrl: settings.whisperApiUrl ?? "",
          whisperModel: settings.whisperModel,
        }}
        onSaved={() => setSaved(true)}
        onDirty={() => setSaved(false)}
      />

      {saved ? (
        <p className="text-sm text-muted-foreground" role="status">
          Settings saved.
        </p>
      ) : null}
    </PageContainer>
  );
}
