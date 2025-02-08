"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SignedOut, SignInButton, SignedIn, UserButton } from "@clerk/nextjs";
import { ModeToggle } from "@/components/mode-toggle";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

const navItems = [
  { name: "Dashboard", href: "/" },
  { name: "Ingredients", href: "/ingredients" },
  { name: "Recipes", href: "/recipes" },
  { name: "Cookings", href: "/cookings" },
  { name: "Servings", href: "/servings" },
  { name: "Personas", href: "/personas" },
] as const;

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="bg-background sticky top-0 z-50 w-full border-b">
      <div className="flex items-center justify-between gap-2">
        {/* Scrollable navigation container */}
        <div className="no-scrollbar flex-1 overflow-x-auto">
          <div className="flex items-center gap-4 p-4">
            {navItems.map((item) => (
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
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 pr-2">
          <SignedOut>
            <SignInButton>
              <Button>Sign In</Button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
          <ModeToggle />
        </div>
      </div>
    </nav>
  );
}
