import { expect, test } from "@playwright/test";
import {
	findPendingInvitationId,
	mcpCaller,
	mintApiToken,
	runCli,
	signUp,
} from "./cli-helpers";

type TaskSummary = {
	id: number;
	title: string;
	status: string;
	deadline: string | null;
	estimate: "n/a" | { min_hours: number; max_hours: number };
	client: string;
	label: string;
	participants: Array<{ name: string; email: string; accepted: boolean }>;
};

function createdTaskId(stdout: string): number {
	const match = /^Task (\d+) /.exec(stdout);
	if (!match?.[1]) throw new Error(`No task ID in: ${stdout}`);
	return Number(match[1]);
}

function listTasks(env: Record<string, string>): TaskSummary[] {
	const run = runCli(["list", "--json"], env);
	expect(run.status).toBe(0);
	return JSON.parse(run.stdout) as TaskSummary[];
}

test("task create captures work in one line and enforces the field contract", async ({
	page,
	baseURL,
}) => {
	if (!baseURL) throw new Error("The base URL fixture is required.");

	await signUp(page, "Create Owner", "create-owner@task-manager.local");
	const token = await mintApiToken(page);
	const env = { TASK_URL: baseURL, TASK_TOKEN: token };

	const seed = await mcpCaller(baseURL, token);
	try {
		await seed.call("create_client", { name: "Globex" });
		await seed.call("create_label", { name: "Ops", color: "#047857" });
	} finally {
		await seed.close();
	}

	// Real values land on the board exactly as passed.
	const fullTitle = "Ship the create command";
	const fullRun = runCli(
		[
			"create",
			"--title",
			fullTitle,
			"--description",
			"Wire the flags onto create_task.",
			"--deadline",
			"2026-08-01",
			"--client",
			"Globex",
			"--estimate",
			"2-4",
			"--label",
			"Ops",
		],
		env,
	);
	expect(fullRun.status).toBe(0);
	expect(fullRun.stdout).toContain("created in Inbox");
	const fullId = createdTaskId(fullRun.stdout);
	expect(listTasks(env).find((task) => task.id === fullId)).toMatchObject({
		title: fullTitle,
		status: "Inbox",
		deadline: "2026-08-01",
		estimate: { min_hours: 2, max_hours: 4 },
		client: "Globex",
		label: "Ops",
	});

	// A single-number estimate means min = max; --status picks the lane.
	const singleRun = runCli(
		[
			"create",
			"--title",
			"Review the padding",
			"--deadline",
			"none",
			"--client",
			"Globex",
			"--estimate",
			"3",
			"--label",
			"Ops",
			"--status",
			"ongoing",
		],
		env,
	);
	expect(singleRun.status).toBe(0);
	const singleId = createdTaskId(singleRun.stdout);
	expect(listTasks(env).find((task) => task.id === singleId)).toMatchObject({
		status: "Ongoing",
		deadline: null,
		estimate: { min_hours: 3, max_hours: 3 },
	});

	// All opt-outs succeed - skipping every field is explicit, never implied.
	const optOutRun = runCli(
		[
			"create",
			"--title",
			"Muse on nothing",
			"--deadline",
			"none",
			"--client",
			"none",
			"--estimate",
			"n/a",
			"--label",
			"no label",
		],
		env,
	);
	expect(optOutRun.status).toBe(0);
	const optOutId = createdTaskId(optOutRun.stdout);
	expect(listTasks(env).find((task) => task.id === optOutId)).toMatchObject({
		deadline: null,
		estimate: "n/a",
		client: "none",
		label: "no label",
	});

	// Omitting a required flag is a usage error naming the flag and its
	// opt-out literal - the contract is enforced at the CLI boundary.
	const optOuts: Array<[string, string, string]> = [
		["--deadline", "none", '"none"'],
		["--client", "none", '"none"'],
		["--estimate", "n/a", '"n/a"'],
		["--label", "no label", '"no label"'],
	];
	for (const [omitted, , literal] of optOuts) {
		const args = ["create", "--title", "Half-formed thought"];
		for (const [flag, value] of optOuts) {
			if (flag !== omitted) args.push(flag, value);
		}
		const missingRun = runCli(args, env);
		expect(missingRun.status).toBe(2);
		expect(missingRun.stderr).toContain(omitted);
		expect(missingRun.stderr).toContain(literal);
	}
	const allOptOutArgs = ["create"];
	for (const [flag, value] of optOuts) allOptOutArgs.push(flag, value);
	const noTitleRun = runCli(allOptOutArgs, env);
	expect(noTitleRun.status).toBe(2);
	expect(noTitleRun.stderr).toContain("--title");

	// A malformed estimate is a usage error too.
	const badEstimateRun = runCli(
		[
			"create",
			"--title",
			"Guesswork",
			"--deadline",
			"none",
			"--client",
			"none",
			"--estimate",
			"soonish",
			"--label",
			"no label",
		],
		env,
	);
	expect(badEstimateRun.status).toBe(2);
	expect(badEstimateRun.stderr).toContain("not an estimate");

	// Unknown client and label names surface the server's existing options.
	const badClientRun = runCli(
		[
			"create",
			"--title",
			"Mystery work",
			"--deadline",
			"none",
			"--client",
			"Initech",
			"--estimate",
			"n/a",
			"--label",
			"no label",
		],
		env,
	);
	expect(badClientRun.status).toBe(1);
	expect(badClientRun.stderr).toContain('Unknown client "Initech"');
	expect(badClientRun.stderr).toContain("Globex");

	const badLabelRun = runCli(
		[
			"create",
			"--title",
			"Mystery work",
			"--deadline",
			"none",
			"--client",
			"none",
			"--estimate",
			"n/a",
			"--label",
			"Deep Work",
		],
		env,
	);
	expect(badLabelRun.status).toBe(1);
	expect(badLabelRun.stderr).toContain('Unknown label "Deep Work"');
	expect(badLabelRun.stderr).toContain("Ops");
});

test("task delegate hands work to a real in-org member", async ({
	page,
	baseURL,
	browser,
}) => {
	if (!baseURL) throw new Error("The base URL fixture is required.");

	await signUp(page, "Delegate Owner", "delegate-owner@task-manager.local");
	const ownerToken = await mintApiToken(page);
	const ownerEnv = { TASK_URL: baseURL, TASK_TOKEN: ownerToken };

	// The owner invites a teammate from Settings > Members; the invitation ID
	// comes from the e2e database (no Resend key, so no real email).
	const inviteeEmail = "member-invitee@task-manager.local";
	await page.goto("/settings/members");
	await page.getByLabel("Email").fill(inviteeEmail);
	await page.getByRole("button", { name: "Send invite" }).click();
	await expect(page.getByText("Invitation sent.")).toBeVisible();
	const invitationId = await findPendingInvitationId(inviteeEmail);

	// The invitee creates their account in a second browser context and
	// accepts the invitation; the signup hook skips workspace creation for
	// invited emails, so they join the owner's org as a member.
	const inviteeContext = await browser.newContext();
	try {
		const inviteePage = await inviteeContext.newPage();
		await inviteePage.goto("/signup");
		await inviteePage.getByLabel("Name").fill("Member Invitee");
		await inviteePage.getByLabel("Email").fill(inviteeEmail);
		await inviteePage.getByLabel("Password").fill("cli-e2e-local-password");
		await inviteePage.getByRole("button", { name: "Create account" }).click();
		await inviteePage.waitForURL((url) => url.pathname !== "/signup");
		await inviteePage.goto(`/accept-invitation/${invitationId}`);
		await inviteePage
			.getByRole("button", { name: "Accept invitation" })
			.click();
		await expect(inviteePage).toHaveURL((url) => url.pathname === "/");
		const inviteeToken = await mintApiToken(inviteePage);
		const inviteeEnv = { TASK_URL: baseURL, TASK_TOKEN: inviteeToken };

		// The owner captures a task; the member cannot see it yet.
		const title = "Rotate the API keys";
		const createRun = runCli(
			[
				"create",
				"--title",
				title,
				"--deadline",
				"none",
				"--client",
				"none",
				"--estimate",
				"n/a",
				"--label",
				"no label",
			],
			ownerEnv,
		);
		expect(createRun.status).toBe(0);
		const taskId = createdTaskId(createRun.stdout);
		expect(listTasks(inviteeEnv).map((task) => task.id)).not.toContain(taskId);

		// Delegating the existing task puts it on the member's board.
		const delegateRun = runCli(
			["delegate", String(taskId), inviteeEmail],
			ownerEnv,
		);
		expect(delegateRun.status).toBe(0);
		expect(delegateRun.stdout).toContain(
			`Task ${taskId} delegated to Member Invitee.`,
		);
		const delegated = listTasks(inviteeEnv).find((task) => task.id === taskId);
		expect(delegated?.title).toBe(title);
		// Self-created tasks assign the creator (accepted immediately);
		// delegation adds the member as a pending participant.
		expect(delegated?.participants).toEqual(
			expect.arrayContaining([
				{
					name: "Delegate Owner",
					email: "delegate-owner@task-manager.local",
					accepted: true,
				},
				{ name: "Member Invitee", email: inviteeEmail, accepted: false },
			]),
		);

		// Create-and-delegate works in one step, contract included.
		const comboRun = runCli(
			[
				"create",
				"--title",
				"Audit the tokens",
				"--deadline",
				"2026-09-01",
				"--client",
				"none",
				"--estimate",
				"1-2",
				"--label",
				"no label",
				"--to",
				"Member Invitee",
			],
			ownerEnv,
		);
		expect(comboRun.status).toBe(0);
		expect(comboRun.stdout).toContain(
			"created and delegated to Member Invitee",
		);
		const comboId = createdTaskId(comboRun.stdout);
		const combo = listTasks(inviteeEnv).find((task) => task.id === comboId);
		expect(combo).toMatchObject({
			title: "Audit the tokens",
			status: "Inbox",
			deadline: "2026-09-01",
			estimate: { min_hours: 1, max_hours: 2 },
		});
		// Create-and-delegate assigns only the delegatee, pending acceptance.
		expect(combo?.participants).toEqual([
			{ name: "Member Invitee", email: inviteeEmail, accepted: false },
		]);

		// Guard rails: an unknown member fails with the roster (exit 1),
		// missing arguments are usage errors (exit 2), and --status cannot
		// ride along with --to (delegated tasks start in Inbox).
		const unknownRun = runCli(
			["delegate", String(taskId), "--to", "nobody@task-manager.local"],
			ownerEnv,
		);
		expect(unknownRun.status).toBe(1);
		expect(unknownRun.stderr).toContain(
			'No organization member matches "nobody@task-manager.local"',
		);
		expect(unknownRun.stderr).toContain("Member Invitee");

		const noToRun = runCli(["delegate", String(taskId)], ownerEnv);
		expect(noToRun.status).toBe(2);
		expect(noToRun.stderr).toContain("Missing <member>");

		const noIdRun = runCli(["delegate", "--to", inviteeEmail], ownerEnv);
		expect(noIdRun.status).toBe(2);

		const statusComboRun = runCli(
			[
				"create",
				"--title",
				"Contradiction",
				"--deadline",
				"none",
				"--client",
				"none",
				"--estimate",
				"n/a",
				"--label",
				"no label",
				"--status",
				"Ongoing",
				"--to",
				inviteeEmail,
			],
			ownerEnv,
		);
		expect(statusComboRun.status).toBe(2);
		expect(statusComboRun.stderr).toContain("--status");
	} finally {
		await inviteeContext.close();
	}
});
