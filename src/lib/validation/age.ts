export function ageInYears(dateOfBirth: string, today = new Date()) {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  let years = today.getUTCFullYear() - birth.getUTCFullYear();
  if (today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())) years--;
  return years;
}
