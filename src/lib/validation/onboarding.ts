import { z } from "zod";

const contextSchema = z.enum(["school", "university", "exam", "selfStudy", "other"]);

export const onboardingSchema = z.object({
  learningContext: contextSchema,
  subjectTitle: z.string().trim().max(150),
  topicTitles: z.array(z.string().trim().min(1).max(150)).max(200),
  weeklyTargetHours: z.number().min(0).max(168),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
