"use client";

import { useEffect } from "react";
import { hydrateShellWorkspace } from "@/lib/workspace/store";
import type { Workspace } from "@/types";

export default function ShellDetailsHydrator({ workspace }: { workspace: Workspace }) {
  useEffect(() => { hydrateShellWorkspace(workspace); }, [workspace]);
  return null;
}
