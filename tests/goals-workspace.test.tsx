import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import en from "@/messages/en.json";
import {
  goalSchema,
  taskSchema,
  milestoneSchema,
} from "@/lib/goals/validation";
import { calculateGoalProgress, type GoalDetail } from "@/lib/goals/model";
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/icons", () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    EditIcon: Icon,
    TrashIcon: Icon,
    ChevronDownIcon: Icon,
    ArrowRightIcon: Icon,
  };
});
import GoalCard from "@/components/goals/GoalCard";
import GoalDetailHeader from "@/components/goals/GoalDetailHeader";
import GoalMilestoneList from "@/components/goals/GoalMilestoneList";
import GoalTaskList from "@/components/goals/GoalTaskList";
import GoalMetrics from "@/components/goals/GoalMetrics";
const id = "00000000-0000-4000-8000-000000000001";
const milestoneId = "00000000-0000-4000-8000-000000000002";
const detail = (): GoalDetail => {
  const goal = {
    ...goalSchema.parse({
      title: "Learn Java",
      category: "career",
      startDate: "2026-10-01",
      targetDate: "2027-01-31",
      progressMode: "tasks",
    }),
    id,
    userId: id,
    version: 3,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-12T00:00:00Z",
  };
  const tasks = ["Read Java foundations", "Practice concurrency"].map(
    (title, index) => ({
      ...taskSchema.parse({
        title,
        milestoneId,
        status: index ? "todo" : "completed",
        description: "Long task description",
        evidence: "Saved evidence",
      }),
      id: `00000000-0000-4000-8000-00000000000${index + 3}`,
      goalId: id,
      completedAt: null,
      updatedAt: goal.updatedAt,
      actualSeconds: 0,
    }),
  );
  const milestones = [
    {
      ...milestoneSchema.parse({ title: "Core Java" }),
      id: milestoneId,
      goalId: id,
    },
  ];
  return {
    goal,
    tasks,
    milestones,
    progress: calculateGoalProgress(
      goal,
      tasks,
      milestones,
      [],
      [],
      "2026-10-12",
    ),
    activity: [],
    sessions: [],
    calendar: [],
    history: [],
    snapshots: [],
  };
};
const render = (children: ReactNode) => {
  const onError = vi.fn();
  const html = renderToStaticMarkup(
    <NextIntlClientProvider
      locale="en"
      messages={en}
      timeZone="UTC"
      onError={onError}
    >
      {children}
    </NextIntlClientProvider>,
  );
  expect(onError).not.toHaveBeenCalled();
  return html;
};
const actions = { onEdit: vi.fn(), onDelete: vi.fn(), onComplete: vi.fn() };
it("uses a semantic card link with sibling controls and real progress", () => {
  const html = render(<GoalCard detail={detail()} {...actions} />);
  expect(html).toContain(`href="/goals/${id}"`);
  expect(html).toContain("50% complete");
  expect(html).toContain("1 of 2 tasks completed");
  expect(html).toContain("Practice concurrency");
  expect(html).not.toMatch(/<a[^>]*>[\s\S]*<button[\s\S]*<\/a>/);
});
it("uses supplied card counts when task bodies were omitted by the list API", () => {
  const value = detail();
  value.tasks = [value.tasks[1]];
  value.taskCounts = { completed: 8, total: 15 };
  expect(render(<GoalCard detail={value} {...actions} />)).toContain(
    "8 of 15 tasks completed",
  );
});
it("shows one goal heading, category, deadline and dependency-aware progress", () => {
  const html = render(
    <GoalDetailHeader detail={detail()} busy={false} {...actions} />,
  );
  expect(html.match(/<h1>/g)).toHaveLength(1);
  expect(html).toContain("Career");
  expect(html).toContain("Jan 31, 2027");
  expect(html).toContain('aria-valuenow="50"');
});
it("shows pending tasks directly and keeps task descriptions collapsed", () => {
  const html = render(
    <GoalTaskList
      detail={detail()}
      compact
      busy={false}
      onToggle={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onHabit={vi.fn()}
    />,
  );
  expect(html).toContain("Practice concurrency");
  expect(html).not.toContain("Read Java foundations");
  expect(html).toContain('role="checkbox"');
  expect(html).toContain("goal-task-details");
  expect(html).not.toContain(" open=");
});
it("keeps roadmap progress visible while milestone details are collapsed", () => {
  const html = render(
    <GoalMilestoneList
      detail={detail()}
      busy={false}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onTasks={vi.fn()}
    />,
  );
  expect(html).toContain("Core Java");
  expect(html).toContain('aria-valuenow="50"');
  expect(html).not.toContain(" open=");
});
it("renders four account-wide metrics including recorded task completion", () => {
  const html = render(
    <GoalMetrics
      statistics={{ active: 3, completed: 2, tasksCompleted: 17, upcoming: 1 }}
    />,
  );
  expect(html.match(/<dt>/g)).toHaveLength(4);
  expect(html).toContain("<dd>17</dd>");
  expect(html).toContain("In the next 7 days");
});
