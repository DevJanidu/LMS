export class AccountEmailUnavailable extends Error {
  constructor(cause?: unknown) {
    super("Account email delivery is temporarily unavailable.", { cause });
    this.name = "AccountEmailUnavailable";
  }
}
