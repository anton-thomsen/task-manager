import { QuickAddForm } from "~/components/quick-add-form";
import { requireSession } from "~/server/auth";

export default async function QuickAddPage() {
	await requireSession();
	return <QuickAddForm />;
}
