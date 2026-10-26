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
    <Item variant={"outline"}>
      <ItemContent>
        <ItemHeader>{decisionPremise}</ItemHeader>
        <ItemDescription>
          Confidence <strong>{confidence.toFixed(2)}</strong>
        </ItemDescription>
      </ItemContent>

      {Array.from(Object.entries(probabilities)).map((probability) => (
        <ItemContent key={probability[0]}>
          <ItemTitle>{probability[0]}</ItemTitle>
          <ItemDescription>
            Confidence <strong>{probability[1].toFixed(2)}</strong>
          </ItemDescription>
        </ItemContent>
      ))}
    </Item>
  );
};

export default ChoiceResult;
