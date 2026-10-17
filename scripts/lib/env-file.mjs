// The one place that maps an environment to its local env file. The files hold secrets and
// are ignored by git; .env.example documents the names. Local tools use .env.develop on
// every branch (including feature branches); staging and production are only used when
// requested explicitly with APP_ENV, so checking out main never points a script at
// production. Deployed branches read their variables from Vercel, not from these files.
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

export const ENV_FILES = Object.freeze({
  development: ".env.develop",
  staging: ".env.staging",
  production: ".env.prod",
});

/** @param {string | undefined} environment */
export function envFileFor(environment = process.env.APP_ENV || "development") {
  const file = ENV_FILES[/** @type {keyof typeof ENV_FILES} */ (environment)];
  if (!file) throw new Error("APP_ENV must be development, staging or production.");
  return file;
}

/** Values of an environment's file, or null when the file does not exist. */
export function readEnvFile(environment) {
  const file = envFileFor(environment);
  return existsSync(file) ? parse(readFileSync(file, "utf8")) : null;
}

/**
 * Loads the selected environment into process.env. Variables already set in the process
 * (CI, an explicit override) win unless `override` is true.
 * @param {{ environment?: string, override?: boolean }} [options]
 */
export function loadAppEnv({ environment, override = false } = {}) {
  const file = envFileFor(environment);
  const values = readEnvFile(environment);
  if (!values) return { file, loaded: false };
  for (const [key, value] of Object.entries(values))
    if (override || process.env[key] === undefined) process.env[key] = value;
  return { file, loaded: true };
}
