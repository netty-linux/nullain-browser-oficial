import { getSkill, readSkillDocument, readSkillFile } from "@/src/mastra/skills/loader";
import { getNullainSession } from "@/lib/server/nullain-auth";

const MAX_PREVIEW_CHARACTERS = 300_000;

export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const session = await getNullainSession(req.headers).catch(() => null);
  const skill = getSkill(name, [], session?.user.id);
  if (!skill) return Response.json({ error: `Skill "${name}" não encontrada` }, { status: 404 });

  const path = new URL(req.url).searchParams.get("path");
  if (!path)
    return Response.json({ error: "O caminho do arquivo é obrigatório." }, { status: 400 });
  const content = path === "SKILL.md" ? readSkillDocument(skill) : readSkillFile(skill, path);
  if (content === null) {
    return Response.json({ error: `Arquivo "${path}" não encontrado.` }, { status: 404 });
  }
  return Response.json(
    {
      path,
      content: content.slice(0, MAX_PREVIEW_CHARACTERS),
      truncated: content.length > MAX_PREVIEW_CHARACTERS,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
