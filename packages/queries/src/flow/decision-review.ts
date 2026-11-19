import { gql } from "../__generated__";

export const DECISION_REVIEW = gql(/* GraphQL */ `
  query DecisionReview($queuedTaskId: Int!) {
    decisionReview(queuedTaskId: $queuedTaskId) {
      queuedTaskId
      taskId
      taskName
      decisionId
      decisionName
      decisionType
      decisionPremise
      instruction
      model
      rawAnswer
      effectiveAnswer
      matchedResultId
      results {
        id
        label
        option
        type
        targetTaskId
        targetTaskName
        scoreThreshold
        probabilityThreshold
        confidenceThreshold
        bias
        matched
      }
      review
      canReview
    }
  }
`);

export const REVIEW_DECISION_STEP = gql(/* GraphQL */ `
  mutation ReviewDecisionStep(
    $queuedTaskId: Int!
    $correct: Boolean!
    $actualResultId: Int
  ) {
    reviewDecisionStep(
      queuedTaskId: $queuedTaskId
      correct: $correct
      actualResultId: $actualResultId
    ) {
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
      }
      review {
        queuedTaskId
        taskId
        taskName
        decisionId
        decisionName
        decisionType
        decisionPremise
        instruction
        model
        rawAnswer
        effectiveAnswer
        matchedResultId
        results {
          id
          label
          option
          type
          targetTaskId
          targetTaskName
          scoreThreshold
          probabilityThreshold
          confidenceThreshold
          bias
          matched
        }
        review
        canReview
      }
    }
  }
`);
