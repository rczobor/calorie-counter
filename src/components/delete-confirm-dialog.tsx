import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import DeleteButton from "./delete-button";

export default function DeleteConfirmDialog({
	label = "Are you sure?",
	onDelete,
	onCancel,
}: {
	label?: string;
	onDelete: () => void;
	onCancel?: () => void;
}) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<DeleteButton />
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{label}</DialogTitle>
					<DialogDescription />
				</DialogHeader>

				<DialogFooter>
					<div className="flex justify-center gap-2">
						<DialogClose asChild>
							<Button type="button" variant="destructive" onClick={onDelete}>
								Delete
							</Button>
						</DialogClose>
						<DialogClose asChild>
							<Button type="button" onClick={onCancel}>
								Cancel
							</Button>
						</DialogClose>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
