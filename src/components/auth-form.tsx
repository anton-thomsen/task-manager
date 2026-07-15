"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "~/lib/auth-client";

type AuthFormProps = {
	mode: "login" | "signup";
};

const inputClass =
	"w-full rounded-md border border-stone-900 bg-white px-3 py-2 text-base";

export function AuthForm({ mode }: AuthFormProps) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [useMagicLink, setUseMagicLink] = useState(false);
	const [magicLinkSent, setMagicLinkSent] = useState(false);
	const isSignup = mode === "signup";

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setIsSubmitting(true);
		const formData = new FormData(event.currentTarget);
		const email = String(formData.get("email") ?? "");
		const password = String(formData.get("password") ?? "");

		try {
			if (!isSignup && useMagicLink) {
				const result = await authClient.signIn.magicLink({
					email,
					callbackURL: "/",
				});
				if (result.error) {
					setError("The sign-in link could not be sent. Try again.");
					return;
				}
				setMagicLinkSent(true);
				return;
			}
			const result = isSignup
				? await authClient.signUp.email({
						email,
						name: String(formData.get("name") ?? ""),
						password,
					})
				: await authClient.signIn.email({ email, password });
			if (result.error) {
				setError(
					isSignup
						? "The account could not be created. Check the fields and try again."
						: "The email or password is incorrect.",
				);
				return;
			}
			router.push("/");
			router.refresh();
		} catch {
			setError("Authentication is temporarily unavailable. Try again.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<main className="mx-auto flex min-h-screen max-w-md items-start px-4 py-12 sm:items-center sm:py-8">
			<section className="w-full rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-5 shadow-[6px_6px_0_#1c1917] sm:p-7">
				<p className="pixel-accent mb-2 text-[0.55rem] text-emerald-800 uppercase">
					Task Manager
				</p>
				<h1 className="display-font font-black text-3xl">
					{isSignup ? "Create your account" : "Sign in"}
				</h1>
				<p className="mt-2 text-sm text-stone-600">
					{isSignup
						? "Registration is available only while signup is enabled."
						: "Use your Task Manager account to continue."}
				</p>

				<form className="mt-6 space-y-4" onSubmit={handleSubmit}>
					{isSignup ? (
						<div>
							<label
								className="mb-1 block font-semibold text-sm"
								htmlFor="name"
							>
								Name
							</label>
							<input
								autoComplete="name"
								className={inputClass}
								id="name"
								maxLength={100}
								name="name"
								required
							/>
						</div>
					) : null}
					<div>
						<label className="mb-1 block font-semibold text-sm" htmlFor="email">
							Email
						</label>
						<input
							autoComplete="username"
							className={inputClass}
							id="email"
							inputMode="email"
							name="email"
							required
							type="email"
						/>
					</div>
					{isSignup || !useMagicLink ? (
						<div>
							<label
								className="mb-1 block font-semibold text-sm"
								htmlFor={isSignup ? "new-password" : "current-password"}
							>
								Password
							</label>
							<input
								autoComplete={isSignup ? "new-password" : "current-password"}
								className={inputClass}
								id={isSignup ? "new-password" : "current-password"}
								minLength={8}
								name="password"
								required
								type="password"
							/>
						</div>
					) : null}
					{magicLinkSent ? (
						<p
							className="rounded-md bg-emerald-100 p-3 text-emerald-950 text-sm"
							role="status"
						>
							Check your email for a sign-in link. You can close this page.
						</p>
					) : null}
					{error ? (
						<p
							className="rounded-md bg-red-100 p-3 text-red-900 text-sm"
							role="alert"
						>
							{error}
						</p>
					) : null}
					<button
						className="w-full rounded-md border border-emerald-950 bg-emerald-700 px-4 py-2.5 font-bold text-white shadow-[2px_2px_0_#052e16] hover:bg-emerald-800 disabled:opacity-60"
						disabled={isSubmitting || magicLinkSent}
						type="submit"
					>
						{isSubmitting
							? isSignup
								? "Creating account..."
								: useMagicLink
									? "Sending link..."
									: "Signing in..."
							: isSignup
								? "Create account"
								: useMagicLink
									? "Email me a sign-in link"
									: "Sign in"}
					</button>
				</form>
				{!isSignup ? (
					<button
						className="mt-4 font-semibold text-sm underline underline-offset-4"
						onClick={() => {
							setUseMagicLink((value) => !value);
							setMagicLinkSent(false);
							setError(null);
						}}
						type="button"
					>
						{useMagicLink
							? "Use a password instead"
							: "Email me a sign-in link instead"}
					</button>
				) : null}
				{isSignup ? (
					<Link
						className="mt-5 inline-block font-semibold text-sm underline"
						href="/login"
					>
						Already registered? Sign in
					</Link>
				) : null}
			</section>
		</main>
	);
}
