import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@repo/ui/components/ui/card";

export default function LandingPage() {
  return (
    <div className="flex flex-row">
      <div></div>
      <div>
        <Card>
          <CardHeader>
            <CardTitle>What do you want to do today?</CardTitle>
            <CardDescription>Upload files or write a prompt</CardDescription>
          </CardHeader>
          <CardContent className="min-h-32"></CardContent>
          <CardFooter>
            <p>Currently not doing anything</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
