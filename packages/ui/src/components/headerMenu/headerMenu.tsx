"use client";

import { cn } from "cn";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "#components/ui/navigation-menu";
import { Spinner } from "#components/ui/spinner";
import { useAuth } from "../auth/auth-provider";

const NAV_ITEMS = [
  { href: "/", label: "Main", requiresAuth: false },
  { href: "/todos", label: "Todos", requiresAuth: true },
  { href: "/files", label: "Files", requiresAuth: true },
  { href: "/decisions", label: "Decisions", requiresAuth: true },
  { href: "/task-queue", label: "Task queue", requiresAuth: true },
  { href: "/tools", label: "Tools", requiresAuth: true },
  { href: "/models", label: "Models", requiresAuth: true },
  { href: "/user", label: "User", requiresAuth: false },
];

const isActivePath = (href: string, currentPath?: string) => {
  if (!currentPath) return false;
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
};

interface HeaderMenuProps {
  currentPath?: string;
}

export default function HeaderMenu({ currentPath }: HeaderMenuProps) {
  const { user, loading } = useAuth();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.requiresAuth || Boolean(user),
  );

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3 md:px-6">
        <NavigationMenu className="min-w-0 flex-1">
          <NavigationMenuList className="w-full flex-wrap justify-start gap-1">
            {visibleItems.map((item) => {
              const active = isActivePath(item.href, currentPath);
              const label =
                item.href === "/user" && user
                  ? `User · ${user.name}`
                  : item.label;

              return (
                <NavigationMenuItem key={item.href}>
                  <NavigationMenuLink
                    href={item.href}
                    className={cn(
                      "max-w-48",
                      active && "bg-muted font-semibold",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="truncate">{label}</span>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              );
            })}
          </NavigationMenuList>
        </NavigationMenu>
        {loading ? <Spinner /> : null}
      </div>
    </header>
  );
}
