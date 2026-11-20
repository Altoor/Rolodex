import { GraphQLError } from "graphql";
import type { SystemOneQuestion } from "ollama";

interface Question {
  type: "choice" | "noul" | "score";
  decisionPremise: string;
  instruction: string;
  options?: string[];
  optionDescriptions?: string[];
}

/**
 * Builds one System One question payload. Values are kept as JSON objects
 * rather than interpolated into a JSON string, so quotes, newlines, and
 * backslashes in user-authored instructions and options cannot break parsing.
 */
export const setupQuestion = ({
  type,
  instruction,
  options,
  optionDescriptions,
}: Question): SystemOneQuestion => {
  switch (type) {
    case "choice": {
      if (!options) {
        throw new GraphQLError("missing options for choice", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      if (!optionDescriptions) {
        throw new GraphQLError("missing optionDescriptions for choice", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const criteria = Object.fromEntries(
        options.map((option, index) => [
          option,
          optionDescriptions[index] ?? "",
        ]),
      );

      return {
        type: "choice",
        instructions: instruction,
        criteria,
      };
    }

    case "noul":
      return {
        type: "noul",
        instructions: instruction,
      };

    case "score": {
      if (!options) {
        throw new GraphQLError("missing options for score", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      return {
        type: "score",
        instructions: instruction,
        criteria: options,
      };
    }

    default:
      throw new GraphQLError(`unsupported question type: ${type}`, {
        extensions: { code: "BAD_USER_INPUT" },
      });
  }
};

export const setupQuestions = (
  questions: Question[],
): Record<string, SystemOneQuestion> =>
  Object.fromEntries(
    questions.map((question) => [
      question.decisionPremise,
      setupQuestion(question),
    ]),
  );
