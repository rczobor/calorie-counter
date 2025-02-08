import { Pencil } from "lucide-react";
import { Button, type ButtonProps } from "./ui/button";

export default function EditButton(props: ButtonProps) {
  return (
    <Button variant="secondary" size="icon" {...props}>
      <Pencil />
    </Button>
  );
}
