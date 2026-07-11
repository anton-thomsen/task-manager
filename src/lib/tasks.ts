export const taskStatuses = ["Inbox", "Review", "Ongoing", "Finished"] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export type TaskOption = {
	id: number;
	name: string;
};

export type LabelOption = TaskOption & {
	color: string;
};
