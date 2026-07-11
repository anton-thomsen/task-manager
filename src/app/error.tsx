"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
	return (
		<main className="mx-auto flex min-h-screen max-w-xl items-center p-6">
			<section className="w-full rounded-2xl border-2 border-stone-900 bg-[#fffdf6] p-6 shadow-[6px_6px_0_#1c1917]">
				<p className="font-bold text-red-800 text-xs uppercase tracking-[0.18em]">
					Unexpected error
				</p>
				<h1 className="display-font mt-1 font-black text-3xl">
					The task manager hit a problem.
				</h1>
				<p className="mt-2 text-stone-600">
					Your data was not intentionally changed. Try loading this view again.
				</p>
				<button
					className="mt-5 rounded-lg bg-emerald-700 px-4 py-2 font-bold text-sm text-white"
					onClick={reset}
					type="button"
				>
					Try again
				</button>
			</section>
		</main>
	);
}
