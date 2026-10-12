import { index, jsonb, pgTable, text, timestamp, boolean, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./schema";
const time = (name: string) => timestamp(name, { withTimezone: true });

/**
 * One row per learner. Absence of a row means the Free plan. Only verified
 * provider webhooks may move a row to a paid plan.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    plan: text("plan").$type<import("@/lib/billing/plans").PlanId>().notNull().default("free"),
    status: text("status").$type<import("@/lib/billing/subscription").SubscriptionStatus>().notNull().default("active"),
    provider: text("provider"),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    currentPeriodEnd: time("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    /** Provider timestamp of the last applied event; older events are ignored. */
    lastEventAt: time("last_event_at"),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("subscriptions_provider_subscription_unique").on(t.provider, t.providerSubscriptionId)],
);

/** Webhook idempotency ledger: a provider event is applied at most once. */
export const billingEvents = pgTable(
  "billing_events",
  {
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    receivedAt: time("received_at").notNull().defaultNow(),
  },
  (t) => [
    unique("billing_events_provider_event_unique").on(t.provider, t.eventId),
    index("billing_events_user_idx").on(t.userId),
  ],
);
