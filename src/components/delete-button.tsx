import { Trash } from "lucide-react";
import { Button, type ButtonProps } from "./ui/button";

export default function DeleteButton(props: ButtonProps) {
  return (
    <Button variant="destructive" className="size-8" {...props}>
      <Trash />
    </Button>
  );
}
