import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import NavItems from "./nav-items";

export default async function Navbar() {
	return (
		<nav className="sticky top-0 z-50 w-full border-b bg-background">
			<div className="flex items-center justify-between gap-2">
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
