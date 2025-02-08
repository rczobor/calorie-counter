import { Trash } from "lucide-react";
import { Button, type ButtonProps } from "./ui/button";

export default function DeleteButton(props: ButtonProps) {
  return (
    <Button variant="destructive" size="icon" {...props}>
      <Trash />
    </Button>
  );
}
