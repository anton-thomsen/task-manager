import { notFound } from "next/navigation";

import { AuthForm } from "~/components/auth-form";
import { env } from "~/env";

export default function SignupPage() {
	if (env.AUTH_ALLOW_SIGNUP !== "true") notFound();
	return <AuthForm mode="signup" />;
}
