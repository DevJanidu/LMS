import { z } from "zod";
import { ageInYears } from "./age";

const contextSchema = z.enum(["school", "university", "exam", "selfStudy", "other"]);

export const onboardingSchema = z.object({
  learningContext: contextSchema,
  subjectTitle: z.string().trim().max(150),
  topicTitles: z.array(z.string().trim().min(1).max(150)).max(200),
  weeklyTargetHours: z.number().min(0).max(168),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** Google sign-in creates the account, so the first onboarding step records consent. */
export const onboardingTermsSchema = z.object({
  acceptedTerms: z.boolean(),
  dateOfBirth: z.iso.date().optional(),
});

export type OnboardingTermsDecision = "accepted" | "termsRequired" | "invalidBirthDate" | "agePolicy" | "underage";

/** `underage` is final: the caller deactivates the account rather than asking again. */
export function onboardingTermsDecision(input: z.infer<typeof onboardingTermsSchema>, minimumAge: number, today = new Date()): OnboardingTermsDecision {
  if (!input.acceptedTerms) return "termsRequired";
  if (input.dateOfBirth && input.dateOfBirth > today.toISOString().slice(0, 10)) return "invalidBirthDate";
  if (minimumAge <= 0) return "accepted";
  if (!input.dateOfBirth) return "agePolicy";
  return ageInYears(input.dateOfBirth, today) < minimumAge ? "underage" : "accepted";
}
