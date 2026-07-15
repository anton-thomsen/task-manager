import { QuickAddForm } from "~/components/quick-add-form";
import { requireMember } from "~/server/auth";

export default async function QuickAddPage() {
	await requireMember();
	return <QuickAddForm />;
}
