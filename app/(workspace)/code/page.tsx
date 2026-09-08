import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NullainCodeWorkspace } from "@/components/nullain-code/workspace";
import { getNullainSession } from "@/lib/server/nullain-auth";

export default async function CodePage() {
  let session = null;
  try {
    session = await getNullainSession(await headers());
  } catch {
    redirect("/code/login");
  }
  if (!session) redirect("/code/login");
  return <NullainCodeWorkspace user={{ name: session.user.name, email: session.user.email }} />;
}
