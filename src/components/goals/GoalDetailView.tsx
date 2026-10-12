"use client";
import type { GoalDetail } from "@/lib/goals/model";
import type { GoalReferences } from "@/lib/goals/service";
import AdvancedGoalDetailView from "./AdvancedGoalDetailView";
interface Props {
  initial: GoalDetail;
  references: GoalReferences;
}
export default function GoalDetailView(props: Props) {
  return <AdvancedGoalDetailView key={props.initial.goal.id} {...props} />;
}
