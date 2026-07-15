import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("tracks a project in hours and keeps rich work logs", async ({ page }) => {
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
	await taskDialog
		.getByLabel("Minimum estimate in hours")
		.fill("32.333333333333336");
	await taskDialog.getByLabel("Maximum estimate in hours").fill("40");
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

	await page.goto(taskHref);
	await expect(
		page.getByText("32.33-40h estimated", { exact: true }),
	).toBeVisible();
	await page.getByRole("button", { name: "Edit" }).click();
	const editDialog = page.getByRole("dialog", { name: "Edit task" });
	await expect(editDialog.getByLabel("Minimum estimate in hours")).toHaveValue(
		"32.333333333333336",
	);
	await editDialog.getByLabel("Description").fill("Preserve my estimate");
	await editDialog.getByRole("button", { name: "Save changes" }).click();
	await page.getByRole("button", { name: "Edit" }).click();
	await expect(editDialog.getByLabel("Minimum estimate in hours")).toHaveValue(
		"32.333333333333336",
	);
	await editDialog.getByRole("button", { name: "Cancel" }).click();

	const subtaskTitle = "Implement responsive layout";
	await page.getByLabel("Subtask title").fill(subtaskTitle);
	await page.getByLabel("Estimated hours").fill("0.1");
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await expect(page.getByText(subtaskTitle)).toBeVisible();
	await expect(page.getByText("0.1h", { exact: true })).toBeVisible();
	await page.getByLabel(`Status for ${subtaskTitle}`).selectOption("Finished");
	const completedSubtasks = page.getByRole("region", {
		name: "Completed subtasks",
	});
	await expect(completedSubtasks.getByText(subtaskTitle)).toBeVisible();

	await page.getByRole("link", { name: /Work log/ }).click();
	await expect(page.getByText(subtaskTitle, { exact: true })).toHaveCount(0);
	await page.getByLabel("What did you do?").fill("Built the responsive layout");
	await page.getByLabel("Time spent (hours)").fill("3.5");
	await page
		.getByLabel("Detailed notes")
		.fill("Implemented the navigation and checked the mobile breakpoint.");
	const pictures = page.getByLabel("Pictures");
	await pictures.setInputFiles({
		buffer: Buffer.from("89504e470d0a1a0a", "hex"),
		mimeType: "image/png",
		name: "truncated.png",
	});
	await page.getByRole("button", { name: "Add work log" }).click();
	await expect(page.getByRole("alert")).toContainText(
		"Images must be complete PNG, JPEG, GIF, or WebP files",
	);
	const oversizedImage = await sharp({
		create: {
			background: "white",
			channels: 3,
			height: 1,
			width: 8193,
		},
	})
		.png()
		.toBuffer();
	await pictures.setInputFiles({
		buffer: oversizedImage,
		mimeType: "image/png",
		name: "too-wide.png",
	});
	await page.getByRole("button", { name: "Add work log" }).click();
	await expect(page.getByRole("alert")).toContainText(
		"no larger than 8192 pixels per side or 20 megapixels",
	);
	await pictures.setInputFiles({
		buffer: Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
			"base64",
		),
		mimeType: "image/png",
		name: "responsive-layout.png",
	});
	await page.getByRole("button", { name: "Add work log" }).click();
	await expect(
		page.getByRole("heading", { name: "Built the responsive layout" }),
	).toBeVisible();
	const logEntry = page.getByRole("article").filter({
		has: page.getByRole("heading", { name: "Built the responsive layout" }),
	});
	await expect(logEntry.getByText(/3\.5h/)).toBeVisible();
	const logImage = logEntry.getByAltText("responsive-layout.png");
	await expect(logImage).toBeVisible();
	const imageUrl = await logImage.getAttribute("src");
	if (!imageUrl) throw new Error("The work log image is missing its URL.");
	const imageResponse = await page.request.get(imageUrl);
	expect(imageResponse.ok()).toBe(true);
	expect(imageResponse.headers()["cache-control"]).toBe("private, no-store");

	page.once("dialog", (dialog) => dialog.accept());
	await page
		.getByRole("button", {
			name: "Delete work log: Built the responsive layout",
		})
		.click();
	await expect(
		page.getByRole("heading", { name: "Built the responsive layout" }),
	).toHaveCount(0);

	await page.getByRole("link", { name: "Tasks", exact: true }).click();
	await completedSubtasks
		.getByLabel(`Status for ${subtaskTitle}`)
		.selectOption("Inbox");
	await expect(
		page.getByTestId("subtask-lane-Inbox").getByText(subtaskTitle),
	).toBeVisible();
	await page.getByRole("button", { name: `Delete ${subtaskTitle}` }).click();
	await expect(page.getByText(subtaskTitle, { exact: true })).toHaveCount(0);
});
