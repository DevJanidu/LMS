/**
 * Every account the auth provider creates is an active learner, whatever the
 * provider profile or request contains. Admins are created only by the seed.
 */
export function newAccountFields(user: { email: string; name?: string | null }) {
  const email = user.email.trim().toLowerCase();
  const name = (user.name?.trim() || email.split("@")[0]).slice(0, 150);
  return { email, name, role: "learner" as const, status: "active" as const };
}
