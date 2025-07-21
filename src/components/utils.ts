import { z } from "zod";

export const requiredNumberInputSchema = () =>
	z
		.string()
		.min(1, { error: "Required" })
		.refine(
			(val) => {
				const num = Number(val);
				return !Number.isNaN(num) && num >= 0;
			},
			{
				error: "Must be a valid number greater than or equal to 0",
			},
		);
