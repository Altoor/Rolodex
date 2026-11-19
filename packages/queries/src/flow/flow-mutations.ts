import { gql } from "../__generated__";

export const PROPOSE_FLOW_START = gql(/* GraphQL */ `
  mutation ProposeFlowStart(
    $state: String!
    $prompt: String
    $fileIds: [Int!]
    $folderIds: [Int!]
  ) {
    proposeFlowStart(
      state: $state
      prompt: $prompt
      fileIds: $fileIds
      folderIds: $folderIds
    ) {
      candidates {
        key
        kind
        taskId
        label
        description
        confidence
      }
      recommendedKey
      reason
      model
      rawAnswer
    }
  }
`);

export const REFINE_FLOW_START_PROPOSAL = gql(/* GraphQL */ `
  mutation RefineFlowStartProposal(
    $state: String!
    $selectedKey: String!
    $prompt: String!
    $fileIds: [Int!]
    $folderIds: [Int!]
  ) {
    refineFlowStartProposal(
      state: $state
      selectedKey: $selectedKey
      prompt: $prompt
      fileIds: $fileIds
      folderIds: $folderIds
    ) {
      candidates {
        key
        kind
        taskId
        label
        description
        confidence
      }
      recommendedKey
      reason
      model
      rawAnswer
    }
  }
`);

export const DRAFT_FLOW_START_TASK = gql(/* GraphQL */ `
  mutation DraftFlowStartTask(
    $kind: FlowStartKind!
    $state: String!
    $prompt: String
    $fileIds: [Int!]
    $folderIds: [Int!]
  ) {
    draftFlowStartTask(
      kind: $kind
      state: $state
      prompt: $prompt
      fileIds: $fileIds
      folderIds: $folderIds
    ) {
      kind
      name
      type
      toolKey
      toolConfig
      toolOutputType
      fallbackTaskId
      decision
      userDecision
      warnings
      model
    }
  }
`);

export const REFINE_FLOW_TASK_DRAFT = gql(/* GraphQL */ `
  mutation RefineFlowTaskDraft(
    $draft: JSON!
    $state: String!
    $prompt: String!
  ) {
    refineFlowTaskDraft(draft: $draft, state: $state, prompt: $prompt) {
      kind
      name
      type
      toolKey
      toolConfig
      toolOutputType
      fallbackTaskId
      decision
      userDecision
      warnings
      model
    }
  }
`);

export const CONFIRM_FLOW_START_DRAFT = gql(/* GraphQL */ `
  mutation ConfirmFlowStartDraft(
    $draft: JSON!
    $state: String!
    $fileIds: [Int!]
    $folderIds: [Int!]
    $start: Boolean!
  ) {
    confirmFlowStartDraft(
      draft: $draft
      state: $state
      fileIds: $fileIds
      folderIds: $folderIds
      start: $start
    ) {
      taskId
      taskName
      created
      warnings
      queuedTask {
        id
        taskId
        state
        toolState
        parentQueuedTaskId
        depth
        status
        runId
        queued_by
        queued_at
        result
        pendingChoice
        model
        decisionModel
        task {
          id
          name
          type
          toolKey
        }
      }
    }
  }
`);

export const WIRE_DECISION_RESULT_TARGET = gql(/* GraphQL */ `
  mutation WireDecisionResultTarget(
    $queuedTaskId: Int!
    $resultId: Int!
    $targetTaskId: Int!
  ) {
    wireDecisionResultTarget(
      queuedTaskId: $queuedTaskId
      resultId: $resultId
      targetTaskId: $targetTaskId
    ) {
      id
      taskId
      state
      toolState
      parentQueuedTaskId
      depth
      status
      runId
      queued_by
      queued_at
      result
      pendingChoice
      model
      decisionModel
      task {
        id
        name
        type
        toolKey
      }
    }
  }
`);
