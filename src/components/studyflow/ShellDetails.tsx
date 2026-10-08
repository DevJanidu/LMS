import { getShellWorkspace } from "@/lib/services/workspace";
import ShellDetailsHydrator from "./ShellDetailsHydrator";

/** Streams noncritical shell data after the authorized frame has rendered. */
export default async function ShellDetails() {
  return <ShellDetailsHydrator workspace={await getShellWorkspace()} />;
}
