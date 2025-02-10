import { Button } from "@/components/ui/button";
import { SignedOut, SignInButton, SignedIn, UserButton } from "@clerk/nextjs";
import { ModeToggle } from "@/components/mode-toggle";
import NavItems from "./nav-items";

export default async function Navbar() {
  return (
    <nav className="bg-background sticky top-0 z-50 w-full border-b">
      <div className="flex items-center justify-between gap-2">
        {/* Scrollable navigation container */}
        <NavItems />

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
