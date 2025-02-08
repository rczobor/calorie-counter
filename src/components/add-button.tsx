import { Plus } from "lucide-react";
import { Button, type ButtonProps } from "./ui/button";

export default function AddButton(props: ButtonProps) {
  return (
    <Button variant="secondary" className="size-8" {...props}>
      <Plus />
    </Button>
  );
}
