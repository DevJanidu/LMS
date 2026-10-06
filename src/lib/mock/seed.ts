import type { Workspace, User, Topic, StudySession } from "@/types";
import { localDay, shiftDay, zonedToUtc } from "@/lib/analytics";

/** Fixed UTC source records with a date-relative seed for useful previews. */
export function createSeed(now = Date.now()): Workspace {
  const today = localDay(now, "Asia/Colombo");
  const timestamp = new Date(now).toISOString();
  const user: User = {
    id: "learner-1",
    name: "Amara Perera",
    email: "amara@example.com",
    role: "learner",
    timezone: "Asia/Colombo",
    learningContext: "selfStudy",
    status: "active",
    createdAt: `${shiftDay(today, -35)}T08:00:00Z`,
    updatedAt: timestamp,
    lastActiveAt: timestamp,
    weeklyTargetMinutes: 720,
    theme: "light",
    weekStartDay: 1,
    reminders: true,
    longestStreak: 18,
  };
  const users: User[] = [
    user,
    ...["Noah Silva", "Leila Hassan", "Oliver Chen", "Maya Fernando"].map(
      (name, index): User => ({
        ...user,
        id: `learner-${index + 2}`,
        name,
        email: `${name.split(" ")[0].toLowerCase()}@example.com`,
        timezone: [
          "Europe/London",
          "America/New_York",
          "Asia/Singapore",
          "Asia/Colombo",
        ][index],
        createdAt: `${shiftDay(today, -index - 1)}T08:00:00Z`,
        lastActiveAt: `${shiftDay(today, -index)}T10:00:00Z`,
        status: index === 3 ? "inactive" : "active",
        longestStreak: 9 + index,
      }),
    ),
  ];
  const subjects = [
    {
      id: "mathematics",
      title: "Mathematics",
      description: "Build confidence with numbers, shapes and patterns.",
      color: "brand" as const,
      targetDate: shiftDay(today, 14),
    },
    {
      id: "algorithms",
      title: "Algorithms",
      description: "Understand how to solve problems efficiently.",
      color: "success" as const,
      targetDate: shiftDay(today, 21),
    },
    {
      id: "aws",
      title: "AWS Solutions Architect",
      description:
        "Prepare for the associate certification, one topic at a time.",
      color: "orange" as const,
      targetDate: shiftDay(today, 45),
    },
  ].map((subject) => ({
    ...subject,
    userId: user.id,
    status: "active" as const,
    createdAt: `${shiftDay(today, -30)}T08:00:00Z`,
    updatedAt: timestamp,
  }));
  const titles = [
    ["Algebra", "Geometry", "Statistics"],
    ["Sorting", "Trees", "Graphs", "Dynamic Programming"],
    [
      "IAM",
      "EC2",
      "S3",
      "VPC",
      "Lambda",
      "RDS",
      "CloudFront",
      "Route 53",
      "CloudWatch",
      "Well-Architected Framework",
    ],
  ];
  const topics: Topic[] = subjects.flatMap((subject, index) =>
    titles[index].map((title, order) => ({
      id: `${subject.id}-${order}`,
      subjectId: subject.id,
      title,
      status:
        order < [1, 2, 7][index]
          ? "completed"
          : order === [1, 2, 7][index]
            ? "inProgress"
            : "notStarted",
      completedAt:
        order < [1, 2, 7][index]
          ? `${shiftDay(today, -order)}T10:00:00Z`
          : undefined,
      targetDate: shiftDay(today, order + 2),
      sortOrder: order,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  );
  const sessions: StudySession[] = users.flatMap((learner, userIndex) =>
    Array.from({ length: 21 }, (_, index) => {
      if (index === 6 || index === 15) return [];
      const day = shiftDay(today, -index);
      if (
        day < localDay(learner.createdAt, learner.timezone) ||
        day > localDay(learner.lastActiveAt, learner.timezone)
      )
        return [];
      const subject = subjects[(index + userIndex) % 3];
      const minutes = 30 + (index % 4) * 15 + userIndex * 5;
      const startedAt = zonedToUtc(
        `${shiftDay(today, -index)}T09:00`,
        learner.timezone,
      );
      return [
        {
          id: `session-${learner.id}-${index}`,
          userId: learner.id,
          subjectId: userIndex ? `${subject.id}-${learner.id}` : subject.id,
          topicId: userIndex
            ? undefined
            : `${subject.id}-${index % titles[(index + userIndex) % 3].length}`,
          startedAt,
          endedAt: new Date(
            Date.parse(startedAt) + minutes * 60000,
          ).toISOString(),
          durationSeconds: minutes * 60,
          status: "valid" as const,
          note: userIndex
            ? undefined
            : "Reviewed examples and practised the key ideas.",
          source: "timer" as const,
          createdAt: startedAt,
        },
      ];
    }).flat(),
  );
  const otherSubjects = users.slice(1).flatMap((learner) =>
    subjects.map((subject) => ({
      ...subject,
      id: `${subject.id}-${learner.id}`,
      userId: learner.id,
    })),
  );
  const otherTopics: Topic[] = otherSubjects.flatMap((subject) =>
    ["Foundations", "Practice", "Review"].map((title, sortOrder) => ({
      id: `${subject.id}-${sortOrder}`,
      subjectId: subject.id,
      title,
      status: sortOrder === 0 ? "completed" : "notStarted",
      completedAt: sortOrder === 0 ? timestamp : undefined,
      sortOrder,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  );
  return {
    user,
    users,
    subjects: [...subjects, ...otherSubjects],
    topics: [...topics, ...otherTopics],
    sessions,
    timer: null,
    resources: [
      ...users
        .slice(1)
        .map((learner, index) => ({
          id: `storage-${learner.id}`,
          userId: learner.id,
          subjectId: `mathematics-${learner.id}`,
          type: "file" as const,
          title: "Study material.pdf",
          mimeType: "application/pdf",
          sizeBytes: (index + 1) * 2300000,
          createdAt: timestamp,
        })),
      {
        id: "resource-1",
        userId: user.id,
        subjectId: "mathematics",
        topicId: "mathematics-0",
        type: "link",
        title: "Algebra practice",
        url: "https://www.khanacademy.org/math/algebra",
        createdAt: timestamp,
      },
      {
        id: "resource-2",
        userId: user.id,
        subjectId: "algorithms",
        topicId: "algorithms-0",
        type: "video",
        title: "Introduction to sorting",
        url: "https://www.youtube.com/watch?v=8hly31xKli0",
        createdAt: timestamp,
      },
      {
        id: "resource-3",
        userId: user.id,
        subjectId: "aws",
        topicId: "aws-2",
        type: "note",
        title: "S3 revision notes",
        textContent:
          "# S3 essentials\n\n- Buckets store objects\n- Enable versioning for recovery\n- Use least-privilege access",
        createdAt: timestamp,
      },
      {
        id: "resource-4",
        userId: user.id,
        subjectId: "mathematics",
        type: "file",
        title: "Geometry practice.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1250000,
        createdAt: timestamp,
      },
    ],
    blocks: [
      {
        id: "block-1",
        userId: user.id,
        subjectId: "mathematics",
        topicId: "mathematics-1",
        title: "Geometry practice",
        startsAt: zonedToUtc(`${today}T17:00`, user.timezone),
        endsAt: zonedToUtc(`${today}T18:00`, user.timezone),
        repeat: "weekly",
        weekdays: [1, 2, 4],
        timezone: user.timezone,
        color: "brand",
        exceptions: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "block-2",
        userId: user.id,
        subjectId: "aws",
        title: "Certification revision",
        startsAt: zonedToUtc(`${today}T19:00`, user.timezone),
        endsAt: zonedToUtc(`${today}T19:45`, user.timezone),
        repeat: "once",
        weekdays: [],
        timezone: user.timezone,
        color: "orange",
        exceptions: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    notifications: [
      {
        id: "notification-1",
        userId: user.id,
        type: "block",
        title: "Geometry practice",
        body: "Your next study block starts at 17:00.",
        scheduledFor: zonedToUtc(`${today}T17:00`, user.timezone),
        createdAt: timestamp,
      },
    ],
    auditLogs: [
      {
        id: "audit-1",
        actorUserId: "admin-1",
        action: "deactivate",
        targetType: "user",
        targetId: "learner-5",
        createdAt: `${today}T08:00:00Z`,
      },
    ],
    settings: { streakMinutes: 10, maxFileSizeMB: 10, storagePerUserMB: 100 },
  };
}
