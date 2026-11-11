import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "#components/ui/item";

interface ChoiceResultProps {
  decisionPremise: string;
  probabilities: Record<string, number>;
  confidence: number;
}

const ChoiceResult = ({
  decisionPremise,
  confidence,
  probabilities,
}: ChoiceResultProps) => {
  return (
    <Item variant="outline">
      <ItemContent>
        <ItemHeader>{decisionPremise}</ItemHeader>
        <ItemDescription>
          Confidence <strong>{confidence.toFixed(2)}</strong>
        </ItemDescription>
      </ItemContent>

      {Object.entries(probabilities).map(([option, probability]) => (
        <ItemContent key={option}>
          <ItemTitle>{option}</ItemTitle>
          <ItemDescription>
            Confidence <strong>{probability.toFixed(2)}</strong>
          </ItemDescription>
        </ItemContent>
      ))}
    </Item>
  );
};

export default ChoiceResult;
