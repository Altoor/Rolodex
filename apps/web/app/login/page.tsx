import HeaderMenu from "@repo/ui/components/headerMenu/headerMenu";
import LoginPage from "@repo/ui/pages/login";

export default function Page() {
  return (
    <main className="flex flex-col justify-start">
      <HeaderMenu></HeaderMenu>
      <LoginPage></LoginPage>
    </main>
  );
}
