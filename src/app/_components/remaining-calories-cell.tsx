"use client";

import { useGetTodayDate } from "@/hooks/use-get-today-date";
import { api } from "@/trpc/react";

export default function PersonaRemainingCaloriesCell({
  personaId,
}: {
  personaId: number;
}) {
  const { startOfToday, endOfToday } = useGetTodayDate();
  const { data } = api.persona.getPersonaCalories.useQuery({
    personaId,
    startDate: startOfToday,
    endDate: endOfToday,
  });

  return <div>{data?.remainingCalories ?? 0}</div>;
}
