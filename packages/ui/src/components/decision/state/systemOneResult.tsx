import type { SystemOneAnswer } from "../decision-answer";
import ChoiceResult from "../choice/choiceResult";
import NoulResult from "../noul/noulResult";
import ScoreResult from "../score/scoreResult";

interface SystemOneResultProps {
  answer: SystemOneAnswer;
  decisionPremise: string;
}

const SystemOneResult = ({ answer, decisionPremise }: SystemOneResultProps) => {
  if (answer.type === "noul") {
    return <NoulResult decisionPremise={decisionPremise} noul={answer.noul} />;
  }

  if (answer.type === "choice") {
    return (
      <ChoiceResult
        decisionPremise={decisionPremise}
        confidence={answer.confidence}
        probabilities={answer.probabilities}
      />
    );
  }

  return (
    <ScoreResult
      decisionPremise={decisionPremise}
      confidence={answer.confidence}
      score={answer.score}
      legend={answer.legend}
      probabilities={answer.probabilities}
    />
  );
};

export default SystemOneResult;
