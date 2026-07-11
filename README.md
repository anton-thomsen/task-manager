# Task Manager

A small, focused task manager for keeping client work visible and moving.

![Task board with work organized across four status lanes](public/screenshots/task-board.png)

## Features

- Drag tasks between Inbox, Review, Ongoing, and Finished
- Organize work by client and label
- Track deadlines, estimates, subtasks, and work logs
- Search, restore, or permanently delete archived tasks
- Keyboard, touch, mobile, and reduced-motion support

## Task details

Each task has its own workspace with sortable subtasks and a combined activity log.

![Task details with subtasks grouped by status](public/screenshots/task-detail.png)

## Archive

![Searchable archived task list](public/screenshots/archived-tasks.png)

## Mobile

<img src="public/screenshots/task-board-mobile.png" alt="Task board on a mobile viewport" width="390">

## Run locally

```bash
pnpm install
cp .env.example .env
./start-database.sh
pnpm exec prisma migrate deploy
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

Next.js, React, TypeScript, Tailwind CSS, Prisma, PostgreSQL, and dnd-kit.
