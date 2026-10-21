import { GraphQLError } from "graphql";

interface Question {
  type: "choice" | "noul" | "score";
  decisionType: string;
  instruction: string;
  options?: string[];
  optionDescriptions?: string[];
}

export const setupQuestion = ({
  type,
  decisionType,
  instruction,
  options,
  optionDescriptions,
}: Question) => {
  let questionJSON = {};
  console.log("type", type);
  switch (type) {
    case "choice":
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
      questionJSON = `
                "${decisionType}": {
                    "type": "choice",
                    "instructions": "${instruction}",
                    "criteria": {${options.map((option, index) => {
                      return `"${option}": "${optionDescriptions[index]}"`;
                    })}}
                }
            `;
      break;
    case "noul":
      questionJSON = `
            "${decisionType}": {
                    "type": "noul",
                    "instructions": "${instruction}"
                }
            `;
      break;
    case "score":
      if (!options) {
        throw new GraphQLError("missing options for score", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      questionJSON = `
            "${decisionType}": {
                "type": "score",
                "instructions": "${instruction}",
                "criteria": [${options.map((option) => {
                  return `"${option}"`;
                })}]
            }
        `;
      break;

    default:
      break;
  }

  return questionJSON;
};

export const setupQuestions = (questions: Question[]) => {
  let questionJSON = JSON.parse(`
            {
                ${questions.map((question) => {
                  return setupQuestion(question);
                })}
                }
            `);

  return questionJSON;
};
