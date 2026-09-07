import { AssistantShell } from "../assistant";

export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AssistantShell>{children}</AssistantShell>;
}
