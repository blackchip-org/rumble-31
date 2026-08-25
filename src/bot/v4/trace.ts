// Trace-collection helpers for specs/bots_v4.md's "Decision Logging".
// A Trace is a plain array the phase functions in phases.ts push
// entries onto when logging is enabled; undefined means logging is
// off, so callers pay nothing for it unless a seat has botLog enabled.

import type { DecisionTraceEntry } from "../../game/types.ts";

export type Trace = DecisionTraceEntry[];

// LogDetail is which of specs/bots_v4.md's two Decision Logging
// levels a seat is enabled at.
export type LogDetail = "summary" | "full";

// record appends a fell-through-or-non-acting trace entry: phase
// evaluated it, but it isn't what produced the turn's action.
export function record(trace: Trace | undefined, phase: string, detail: string): void {
  trace?.push({ phase, detail, acted: false });
}

// recordAction appends the trace entry for whichever phase produced
// the turn's action. detail is the Full Trace wording; summary is the
// (usually more specific, e.g. including a score delta) Summary
// wording.
export function recordAction(trace: Trace | undefined, phase: string, detail: string, summary: string): void {
  trace?.push({ phase, detail, acted: true, summary });
}
