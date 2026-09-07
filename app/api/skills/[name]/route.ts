import { getSkill, deleteUserSkill, listUserSkillNames } from "@/src/mastra/skills/loader";
import { isCrossSiteMutation } from "@/lib/server/request-security";

/**
 * GET /api/skills/[name] — corpo completo da skill (preview na UI).
 * DELETE /api/skills/[name] — remove skill de usuário (builtin: 403).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const skill = getSkill(name);
  if (!skill) {
    return Response.json({ error: `Skill "${name}" não encontrada` }, { status: 404 });
  }
  const user = listUserSkillNames().includes(skill.name);
  return Response.json({
    name: skill.name,
    description: skill.description,
    body: skill.body,
    user,
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ name: string }> }) {
  if (isCrossSiteMutation(req)) {
    return Response.json({ error: "Origem não permitida" }, { status: 403 });
  }
  const { name } = await ctx.params;
  if (!listUserSkillNames().includes(name)) {
    return Response.json(
      { error: "Skill não encontrada ou não é removível (builtin)" },
      { status: 403 },
    );
  }
  const removed = deleteUserSkill(name);
  if (!removed) {
    return Response.json({ error: `Skill "${name}" não encontrada` }, { status: 404 });
  }
  return Response.json({ ok: true, name });
}
