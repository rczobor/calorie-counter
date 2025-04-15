import { Minus } from "lucide-react";
import { Button, type ButtonProps } from "./ui/button";

export default function MinusButton(props: ButtonProps) {
	return (
		<Button variant="secondary" size="icon" {...props}>
			<Minus />
		</Button>
	);
}
