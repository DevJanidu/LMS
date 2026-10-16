"use client";
import { createAuthClient } from "better-auth/react";

/** Same-origin client for the guarded `/api/auth` route. */
export const authClient = createAuthClient();
