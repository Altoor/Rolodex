import { gql } from "@apollo/client";

const ATTEMPT_FIELDS = `
  id
  queuedTaskId
  attemptNumber
  kind
  status
  taskSnapshot
  beforeState
  beforeToolState
  afterState
  afterToolState
  result
  effectJournal
  revision
  review
  workspaceKey
  createdAt
  finishedAt
  committedAt
`;

const RUN_FIELDS = `
  id
  status
  mode
  state
  startTaskId
  createdAt
  updatedAt
  steps {
    id
    taskId
    depth
    status
    state
    result
    pendingChoice
    task { id name type }
    attempts { ${ATTEMPT_FIELDS} }
    currentAttempt { ${ATTEMPT_FIELDS} }
  }
  attempts { ${ATTEMPT_FIELDS} }
`;

export const ASSISTED_RUN = gql(`
  query AssistedRun($runId: String!) {
    assistedRun(runId: $runId) { ${RUN_FIELDS} }
  }
`);

export const ACTIVE_ASSISTED_RUNS = gql(`
  query ActiveAssistedRuns {
    activeAssistedRuns { ${RUN_FIELDS} }
  }
`);

export const ASSISTED_RUN_HISTORY = gql(`
  query AssistedRunHistory($limit: Int, $offset: Int) {
    assistedRunHistory(limit: $limit, offset: $offset) { ${RUN_FIELDS} }
  }
`);

export const START_ASSISTED_RUN = gql(`
  mutation StartAssistedRun($input: JSON!) {
    startAssistedRun(input: $input) { ${RUN_FIELDS} }
  }
`);

export const ACCEPT_STEP_ATTEMPT = gql(`
  mutation AcceptStepAttempt($attemptId: Int!) {
    acceptStepAttempt(attemptId: $attemptId) { ${RUN_FIELDS} }
  }
`);

export const REQUEST_STEP_REVISION = gql(`
  mutation RequestStepRevision($attemptId: Int!, $feedback: String!) {
    requestStepRevision(attemptId: $attemptId, feedback: $feedback)
  }
`);

export const APPLY_STEP_REVISION = gql(`
  mutation ApplyStepRevision($attemptId: Int!, $proposal: JSON!) {
    applyStepRevision(attemptId: $attemptId, proposal: $proposal) { ${RUN_FIELDS} }
  }
`);

export const OVERRIDE_DECISION = gql(`
  mutation OverrideDecision($attemptId: Int!, $resultId: Int!) {
    overrideDecision(attemptId: $attemptId, resultId: $resultId) { ${RUN_FIELDS} }
  }
`);

export const OPTIMIZE_DECISION = gql(`
  mutation OptimizeDecision(
    $attemptId: Int!
    $expectedResultId: Int!
    $feedback: String
  ) {
    optimizeDecision(
      attemptId: $attemptId
      expectedResultId: $expectedResultId
      feedback: $feedback
    ) { ${RUN_FIELDS} }
  }
`);

export const EDIT_DECISION_WORDING = gql(`
  mutation EditDecisionWording(
    $attemptId: Int!
    $decisionPremise: String!
    $instruction: String!
    $optionDescriptions: [String!]
  ) {
    editDecisionWording(
      attemptId: $attemptId
      decisionPremise: $decisionPremise
      instruction: $instruction
      optionDescriptions: $optionDescriptions
    ) { ${RUN_FIELDS} }
  }
`);

export const ADD_DECISION_OPTION = gql(`
  mutation AddDecisionOption(
    $attemptId: Int!
    $label: String!
    $description: String
    $value: String
    $targetTaskId: Int
  ) {
    addDecisionOption(
      attemptId: $attemptId
      label: $label
      description: $description
      value: $value
      targetTaskId: $targetTaskId
    ) { ${RUN_FIELDS} }
  }
`);

export const DRAFT_DECISION_TARGET_TASK = gql(`
  mutation DraftDecisionTargetTask(
    $attemptId: Int!
    $feedback: String
    $draft: JSON
  ) {
    draftDecisionTargetTask(
      attemptId: $attemptId
      feedback: $feedback
      draft: $draft
    )
  }
`);

export const WIRE_DECISION_TARGET_TASK = gql(`
  mutation WireDecisionTargetTask(
    $attemptId: Int!
    $resultId: Int!
    $targetTaskId: Int!
  ) {
    wireDecisionTargetTask(
      attemptId: $attemptId
      resultId: $resultId
      targetTaskId: $targetTaskId
    ) { ${RUN_FIELDS} }
  }
`);

export const CREATE_DECISION_TARGET_TASK = gql(`
  mutation CreateDecisionTargetTask(
    $attemptId: Int!
    $resultId: Int!
    $draft: JSON!
  ) {
    createDecisionTargetTask(
      attemptId: $attemptId
      resultId: $resultId
      draft: $draft
    ) { ${RUN_FIELDS} }
  }
`);

export const CANCEL_ASSISTED_RUN = gql(`
  mutation CancelAssistedRun($runId: String!) {
    cancelAssistedRun(runId: $runId)
  }
`);

export const SAVE_USER_DECISION_OPTIONS = gql(`
  mutation SaveUserDecisionOptions($attemptId: Int!, $options: JSON!) {
    saveUserDecisionOptions(attemptId: $attemptId, options: $options) {
      ${RUN_FIELDS}
    }
  }
`);

const TRACE_EVENT_FIELDS = `
  id
  attemptId
  sequence
  kind
  payload
  createdAt
`;

export const ATTEMPT_TRACE = gql(`
  query AttemptTrace($attemptId: Int!) {
    attemptTrace(attemptId: $attemptId) { ${TRACE_EVENT_FIELDS} }
  }
`);

export const ASSISTED_TRACE_EVENT = gql(`
  subscription AssistedTraceEvent($runId: String!) {
    assistedTraceEvent(runId: $runId) { ${TRACE_EVENT_FIELDS} }
  }
`);
