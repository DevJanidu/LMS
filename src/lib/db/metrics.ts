import "server-only";
let queries = 0;
/** No SQL text, parameter values or user identifiers enter telemetry. */
export function recordQuery() { queries++; }
export function queryCount() { return queries; }
