import "@/styles/globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import Navbar from "@/app/_components/navbar";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
	title: "Calorie Counter",
	description: "App to count your daily calories",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<ClerkProvider>
			<TRPCReactProvider>
				<html
					lang="en"
					className={`${GeistSans.variable}`}
					suppressHydrationWarning
				>
					<body>
						<ThemeProvider
							attribute="class"
							defaultTheme="system"
							enableSystem
							disableTransitionOnChange
						>
							<header>
								<Navbar />
							</header>
							<main>{children}</main>
							<Toaster />
							<SpeedInsights />
							<Analytics />
						</ThemeProvider>
					</body>
				</html>
			</TRPCReactProvider>
		</ClerkProvider>
	);
}
