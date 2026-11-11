import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "#components/ui/item";

interface ScoreResultProps {
  decisionPremise: string;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
  score: number;
}

const ScoreResult = ({
  decisionPremise,
  score,
  confidence,
  probabilities,
  legend,
}: ScoreResultProps) => {
  return (
    <Item variant="outline">
      <ItemContent>
        <ItemHeader>{decisionPremise}</ItemHeader>
        <ItemDescription>
          Confidence <strong>{confidence.toFixed(2)}</strong>
        </ItemDescription>
        <ItemDescription>
          Score <strong>{score.toFixed(2)}</strong>
        </ItemDescription>
      </ItemContent>

      {Object.entries(probabilities).map(([option, probability]) => (
        <ItemContent key={option}>
          <ItemTitle>{legend[option]}</ItemTitle>
          <ItemDescription>
            Confidence <strong>{probability.toFixed(2)}</strong>
          </ItemDescription>
        </ItemContent>
      ))}
    </Item>
  );
};

export default ScoreResult;
