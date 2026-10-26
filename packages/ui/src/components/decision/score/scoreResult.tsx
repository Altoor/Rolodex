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
  console.log(Object.entries(legend));
  return (
    <Item variant={"outline"}>
      <ItemContent>
        <ItemHeader>{decisionPremise}</ItemHeader>
        <ItemDescription>
          Confidence <strong>{confidence.toFixed(2)}</strong>
        </ItemDescription>
        <ItemDescription>
          Score <strong>{score.toFixed(2)}</strong>
        </ItemDescription>
      </ItemContent>

      {Array.from(Object.entries(probabilities)).map((probability) => (
        <ItemContent key={probability[0]}>
          <ItemTitle>{legend[probability[0]]}</ItemTitle>
          <ItemDescription>
            Confidence <strong>{probability[1].toFixed(2)}</strong>
          </ItemDescription>
        </ItemContent>
      ))}
    </Item>
  );
};

export default ScoreResult;
