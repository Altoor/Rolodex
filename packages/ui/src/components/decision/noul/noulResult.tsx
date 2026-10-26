import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "#components/ui/item";

interface NoulResultProps {
  decisionPremise: string;
  noul: number;
}

const NoulResult = ({ decisionPremise, noul }: NoulResultProps) => {
  return (
    <Item variant={"outline"} className="max-w-60">
      <ItemContent>
        <ItemHeader>{decisionPremise}</ItemHeader>
        <ItemDescription>
          Confidence is <strong>{noul.toFixed(2)}</strong>
        </ItemDescription>
      </ItemContent>
    </Item>
  );
};

export default NoulResult;
