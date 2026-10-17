"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { ProposalRecord } from "../ProposalCard";
export interface BlockEnvironment {
  /** The saved conversation; null until the server has accepted the first message. */
  conversationId: string | null;
  timezone: string;
  /** Adds or replaces proposals created by a block (checklist → goal, re-planned schedule). */
  onProposals: (add: ProposalRecord[], retire?: string[]) => void;
  /** Puts a prepared message in the composer; the student decides whether to send it. */
  onCompose: (text: string) => void;
  /** Tells other tabs that saved block state changed. */
  onSaved: () => void;
}
const Context = createContext<BlockEnvironment>({
  conversationId: null,
  timezone: "UTC",
  onProposals: () => {},
  onCompose: () => {},
  onSaved: () => {},
});
export function BlockProvider({ value, children }: { value: BlockEnvironment; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useBlockEnvironment = () => useContext(Context);
