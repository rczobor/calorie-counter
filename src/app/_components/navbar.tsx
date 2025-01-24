import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SignedOut, SignInButton, SignedIn, UserButton } from "@clerk/nextjs";
import { ModeToggle } from "@/components/mode-toggle";

const navItems = [
  { name: "Dashboard", href: "/" },
  { name: "Ingredients", href: "/ingredients" },
  { name: "Recipes", href: "/recipes" },
  { name: "Cookings", href: "/cookings" },
  { name: "Servings", href: "/servings" },
  { name: "Personas", href: "/personas" },
] as const;

export default function Navbar() {
  return (
    <nav className="bg-background sticky top-0 z-50 w-full border-b">
      <div className="flex h-16 items-center justify-between gap-4 px-4">
        {/* Scrollable navigation container */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex items-center gap-4 p-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground hover:text-primary text-sm font-medium whitespace-nowrap transition-colors"
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
          </SignedIn>
          <ModeToggle />
        </div>
      </div>
    </nav>
  );
}
