"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useGetTodayDate } from "@/hooks/use-get-today-date";
import { api } from "@/trpc/react";

export default function PersonaRemainingCaloriesCell({
	personaId,
}: {
	personaId: number;
}) {
	const { startOfToday, endOfToday } = useGetTodayDate();
	const { data, isLoading } = api.persona.getPersonaCalories.useQuery({
		personaId,
		startDate: startOfToday,
		endDate: endOfToday,
	});

	return isLoading ? (
		<Skeleton className="h-5 w-full" />
	) : (
		<div>{data?.remainingCalories}</div>
	);
}
