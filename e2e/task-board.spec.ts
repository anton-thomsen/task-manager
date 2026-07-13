import { expect, test } from "@playwright/test";

test("moves a task into an adjacent empty lane and persists the move", async ({
	page,
}) => {
	await page.goto("/signup");
	await page.getByLabel("Name").fill("Playwright");
	await page.getByLabel("Email").fill("playwright@task-manager.local");
	await page.getByLabel("Password").fill("playwright-local-password");
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page).toHaveURL((url) => url.pathname === "/");

	const title = "E2E adjacent-lane drag";
	await page.getByRole("button", { name: "Create task" }).click();
	const taskDialog = page.getByRole("dialog", { name: "Create a task" });
	await taskDialog.getByLabel("Title").fill(title);
	await taskDialog.getByLabel("Status").selectOption("Ongoing");
	await taskDialog.getByRole("button", { name: "Add task" }).click();

	const sourceLink = page.getByRole("link", { name: title, exact: true });
	await expect(sourceLink).toBeVisible();
	const taskHref = await sourceLink.getAttribute("href");
	if (!taskHref) throw new Error("Created task is missing its detail link.");
	const taskId = taskHref.slice(taskHref.lastIndexOf("/") + 1);
	const sourceTask = page.getByTestId(`task-${taskId}`);
	const ongoingLane = page.getByTestId("lane-Ongoing");
	const finishedLane = page.getByTestId("lane-Finished");
	await expect(ongoingLane.getByTestId(`task-${taskId}`)).toBeVisible();
	await expect(finishedLane.locator('[data-testid^="task-"]')).toHaveCount(0);
	const [sourceBox, finishedBox] = await Promise.all([
		sourceTask.boundingBox(),
		finishedLane.boundingBox(),
	]);
	if (!sourceBox || !finishedBox) {
		throw new Error("The task or Finished lane is not visible.");
	}

	const startX = sourceBox.x + sourceBox.width - 12;
	const startY = sourceBox.y + sourceBox.height / 2;
	const destinationX = finishedBox.x + 12;
	const destinationY = Math.min(
		Math.max(startY, finishedBox.y + 80),
		finishedBox.y + finishedBox.height - 24,
	);

	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.mouse.move(startX + 8, startY, { steps: 2 });
	await page.mouse.move(destinationX, destinationY, { steps: 20 });
	await expect(finishedLane).toHaveClass(/ring-emerald-600/);

	const moveResponse = page.waitForResponse(
		(response) =>
			response.request().method() === "POST" &&
			response.request().headers()["next-action"] !== undefined,
	);
	await page.mouse.up();
	expect((await moveResponse).ok()).toBe(true);

	await expect(
		finishedLane.getByRole("link", { name: title, exact: true }),
	).toBeVisible();
	await expect(page.locator("main").getByRole("alert")).toHaveCount(0);

	await page.reload();
	await expect(
		page
			.getByTestId("lane-Finished")
			.getByRole("link", { name: title, exact: true }),
	).toBeVisible();
});
