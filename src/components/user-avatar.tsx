export type UserRef = {
	userId: string;
	name: string;
	image: string | null;
};

const sizeClasses = {
	sm: "size-5 text-[0.55rem]",
	md: "size-7 text-[0.7rem]",
} as const;

export function UserAvatar({
	user,
	size = "md",
}: {
	user: UserRef;
	size?: keyof typeof sizeClasses;
}) {
	const initial = user.name.trim().charAt(0).toUpperCase() || "?";
	if (user.image) {
		return (
			<img
				alt={user.name}
				className={`${sizeClasses[size]} rounded-full border border-stone-900 object-cover`}
				src={user.image}
				title={user.name}
			/>
		);
	}
	return (
		<span
			aria-label={user.name}
			className={`${sizeClasses[size]} inline-grid place-items-center rounded-full border border-stone-900 bg-emerald-700 font-bold text-white`}
			role="img"
			title={user.name}
		>
			{initial}
		</span>
	);
}
