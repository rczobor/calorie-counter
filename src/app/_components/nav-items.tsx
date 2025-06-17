"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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
								"whitespace-nowrap font-medium text-muted-foreground text-sm transition-colors hover:text-primary",
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
