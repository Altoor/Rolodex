"use client";

import LandingPage from "@repo/ui/pages/landing";
import HeaderMenu from "@repo/ui/components/headerMenu/headerMenu";

export default function Page() {
  return (
    <main>
      <HeaderMenu></HeaderMenu>
      <LandingPage></LandingPage>
    </main>
  );
}
