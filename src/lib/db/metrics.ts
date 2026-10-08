import "server-only";
import { recordDatabaseCall } from "@/lib/perf";
let queries = 0;
/** No SQL text, parameter values or user identifiers enter telemetry. */
export function recordQuery() { queries++; recordDatabaseCall(); }
export function queryCount() { return queries; }
