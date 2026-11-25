"use client";

import { LandingComposer } from "../components/landing/landing-composer";
import { LandingRuns } from "../components/landing/landing-runs";
import { useLandingPage } from "../components/landing/use-landing-page";
import { AssistedRuns } from "../components/assisted";
import { EmptyState } from "#components/feedback/empty-state";
import { LoadingState } from "#components/feedback/loading-state";
import { PageContainer } from "#components/layout/page-container";
import { PageHeader } from "#components/layout/page-header";

export default function LandingPage() {
  const {
    authLoading,
    loggedIn,
    tasks,
    composer,
    runs,
    autoImprovement,
    assistedRunIds,
    answerAssistedUserChoice,
  } = useLandingPage();

  if (authLoading) {
    return (
      <PageContainer>
        <LoadingState label="Checking your session…" />
      </PageContainer>
    );
  }

  if (!loggedIn) {
    return (
      <PageContainer>
        <PageHeader
          title="What do you want to do today?"
          description="Rolodex runs decision-driven tasks with a local model."
        />
        <EmptyState
          title="Sign in to queue a run"
          description="Your tasks, decisions, and queue defaults are tied to your account."
          actionHref="/user"
          actionLabel="Go to account"
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <LandingComposer
        tasks={tasks}
        {...composer}
        autoEnabled={autoImprovement}
      >
        {autoImprovement ? (
          <AssistedRuns
            enabled
            extraRunIds={assistedRunIds}
            onAnswerUserChoice={answerAssistedUserChoice}
          />
        ) : (
          <LandingRuns tasks={tasks} {...runs} />
        )}
      </LandingComposer>
    </PageContainer>
  );
}
