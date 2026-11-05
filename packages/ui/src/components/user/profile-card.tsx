import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#components/ui/card";

interface ProfileCardProps {
  name: string;
  email: string;
}

export function ProfileCard({ name, email }: ProfileCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription>{email}</CardDescription>
      </CardHeader>
    </Card>
  );
}
