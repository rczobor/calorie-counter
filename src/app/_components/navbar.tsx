import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  SignedOut,
  SignInButton,
  SignedIn,
  UserButton,
  SignOutButton,
} from "@clerk/nextjs";
import { ModeToggle } from "@/components/mode-toggle";

const navItems = [
  { name: "Dashboard", href: "/" },
  { name: "Ingredients", href: "/ingredients" },
  { name: "Recipes", href: "/recipes" },
  { name: "Cookings", href: "/cookings" },
  { name: "Servings", href: "/servings" },
] as const;

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="flex h-16 items-center justify-between gap-4 px-4">
        {/* Scrollable navigation container */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex items-center gap-4 p-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                {item.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <SignedOut>
            <SignInButton>
              <Button>Sign In</Button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
            <SignOutButton>
              <Button variant="outline">Sign Out</Button>
            </SignOutButton>
          </SignedIn>
          <ModeToggle />
        </div>
      </div>
    </nav>
  );
}
