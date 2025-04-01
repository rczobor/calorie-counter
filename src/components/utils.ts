import { z } from "zod";

export const requiredNumberInputSchema = (zodSchema: z.ZodNumber) =>
  z.string().min(1, { message: "Required" }).pipe(zodSchema);
