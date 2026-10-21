import HeaderMenu from "@repo/ui/components/headerMenu/headerMenu";
import SignUpPagePage from "@repo/ui/pages/signUp";

export default function Page() {
  return (
    <main className="flex flex-col justify-start">
      <HeaderMenu></HeaderMenu>
      <SignUpPagePage></SignUpPagePage>
    </main>
  );
}
