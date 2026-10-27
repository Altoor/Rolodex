"use client";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuButton,
  NavigationMenuTrigger,
  NavigationMenuPositioner,
} from "#components/ui/navigation-menu";
import { Spinner } from "#components/ui/spinner";
import { useQuery } from "@apollo/client/react";
import { ME } from "@repo/queries/user/users-queries";

export default function HeaderMenu() {
  const { loading, data } = useQuery(ME);

  const logout = () => {
    localStorage.removeItem("auth_token");
    window.location.reload();
  };

  return (
    <div className="flex w-full p-6 md:p-10">
      <NavigationMenu className="w-full flex flex-row ">
        <NavigationMenuList className="w-full">
          <NavigationMenuItem>
            <NavigationMenuLink href="/">Main</NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="/decisions">Decisions</NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="/models">Models</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
        <NavigationMenuList>
          <NavigationMenuItem>
            {loading ? (
              <Spinner />
            ) : data ? (
              <NavigationMenuButton onClick={logout}>
                Logout
              </NavigationMenuButton>
            ) : (
              <NavigationMenuLink href="login">Login</NavigationMenuLink>
            )}
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    </div>
  );
}
