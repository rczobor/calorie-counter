"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { name: "Dashboard", href: "/" },
  { name: "Ingredients", href: "/ingredients" },
  { name: "Recipes", href: "/recipes" },
  { name: "Cookings", href: "/cookings" },
  { name: "Servings", href: "/servings" },
  { name: "Personas", href: "/personas" },
] as const;

export default function NavItems() {
  const pathname = usePathname();

  return (
    <div className="no-scrollbar flex-1 overflow-x-auto">
      <div className="flex items-center gap-4 p-4">
        {navItems.map((item) => {
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-muted-foreground hover:text-primary text-sm font-medium whitespace-nowrap transition-colors",
                pathname === item.href && "text-primary",
              )}
            >
              {item.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
