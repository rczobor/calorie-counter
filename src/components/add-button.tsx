import { Plus } from "lucide-react";
import { Button, type ButtonProps } from "./ui/button";

export default function AddButton(props: ButtonProps) {
  return (
    <Button variant="secondary" size="icon" {...props}>
      <Plus />
    </Button>
  );
}
