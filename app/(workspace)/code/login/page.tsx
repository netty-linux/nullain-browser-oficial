import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NullainCodeLoginForm } from "@/components/nullain-code/login-form";
import { getNullainSession } from "@/lib/server/nullain-auth";

export default async function LoginPage() {
  let unavailable: string | undefined;
  let session = null;
  try {
    session = await getNullainSession(await headers());
  } catch {
    unavailable = "Nullain Code ainda não foi configurado ou migrado.";
  }
  if (session) redirect("/code");
  return <NullainCodeLoginForm unavailable={unavailable} />;
}
