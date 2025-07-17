import { z } from "zod";

export const requiredNumberInputSchema = () =>
	z.string()
		.min(1, { message: "Required" })
		.refine((val) => {
			const num = Number(val);
			return !isNaN(num) && num >= 0;
		}, {
			message: "Must be a valid number greater than or equal to 0",
		});
