"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { LoginForm } from "../components/auth/loginForm";
import { useAuth, type CurrentUser } from "../components/auth/auth-provider";
import { LoadingState } from "#components/feedback/loading-state";
import { PageContainer } from "#components/layout/page-container";
import { PageHeader } from "#components/layout/page-header";
import { ProfileCard } from "#components/user/profile-card";
import { UserSettingsForm } from "#components/user/user-settings-form";
import { Button } from "#components/ui/button";
import { Separator } from "#components/ui/separator";

export default function UserPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <PageContainer>
        <LoadingState label="Checking your session…" />
      </PageContainer>
    );
  }

  if (!user) {
    return (
      <PageContainer className="max-w-xl">
        <PageHeader
          title="Account"
          description="Log in to manage your profile and queue defaults."
        />
        <LoginForm />
      </PageContainer>
    );
  }

  return <AuthenticatedUserPage user={user} />;
}

function AuthenticatedUserPage({ user }: { user: CurrentUser }) {
  const { logout } = useAuth();
  const [saved, setSaved] = useState(false);
  const settingsKey = `${user.settings?.defaultTaskId ?? "none"}-${
    user.settings?.defaultModelName ?? "none"
  }-${user.settings?.defaultDecisionModelName ?? "none"}-${
    user.settings?.defaultVisionModelName ?? "none"
  }`;

  return (
    <PageContainer>
      <PageHeader
        title="Account"
        description="Manage your profile and the defaults used when you queue a run."
        actions={
          <Button variant="outline" onClick={logout}>
            <LogOut />
            Log out
          </Button>
        }
      />

      <ProfileCard name={user.name} email={user.email} />

      <UserSettingsForm
        key={settingsKey}
        initialDefaultTaskId={user.settings?.defaultTaskId ?? null}
        initialDefaultModelName={user.settings?.defaultModelName ?? null}
        initialDefaultDecisionModelName={
          user.settings?.defaultDecisionModelName ?? null
        }
        initialDefaultVisionModelName={
          user.settings?.defaultVisionModelName ?? null
        }
        onSaved={() => setSaved(true)}
        onDirty={() => setSaved(false)}
      />
      {saved ? (
        <p className="text-sm text-muted-foreground" role="status">
          Queue defaults saved.
        </p>
      ) : null}

      <Separator />
    </PageContainer>
  );
}
