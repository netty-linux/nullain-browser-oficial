import {
  getSkill,
  deleteUserSkill,
  listSkillFileEntries,
  readSkillDocument,
} from "@/src/mastra/skills/loader";
import { isCrossSiteMutation } from "@/lib/server/request-security";
import { getNullainSession } from "@/lib/server/nullain-auth";

/**
 * GET /api/skills/[name] — corpo completo da skill (preview na UI).
 * DELETE /api/skills/[name] — remove skill de usuário (builtin: 403).
 */
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const session = await getNullainSession(req.headers).catch(() => null);
  const skill = getSkill(name, [], session?.user.id);
  if (!skill) {
    return Response.json({ error: `Skill "${name}" não encontrada` }, { status: 404 });
  }
  return Response.json({
    name: skill.name,
    description: skill.description,
    displayName: skill.displayName,
    summary: skill.summary,
    body: skill.body,
    document: readSkillDocument(skill),
    frontmatter: skill.frontmatter,
    files: listSkillFileEntries(skill),
    source: skill.source,
    user: skill.source === "user",
    native: skill.source === "native",
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ name: string }> }) {
  if (isCrossSiteMutation(req)) {
    return Response.json({ error: "Origem não permitida" }, { status: 403 });
  }
  const session = await getNullainSession(req.headers);
  if (!session)
    return Response.json({ error: "Entre na sua conta para excluir skills." }, { status: 401 });
  const { name } = await ctx.params;
  const skill = getSkill(name, [], session.user.id);
  if (!skill || skill.source !== "user") {
    return Response.json(
      { error: "Skill não encontrada ou não é removível (builtin)" },
      { status: 403 },
    );
  }
  const removed = deleteUserSkill(session.user.id, name);
  if (!removed) {
    return Response.json({ error: `Skill "${name}" não encontrada` }, { status: 404 });
  }
  return Response.json({ ok: true, name });
}
