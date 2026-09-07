import {
  loadSkills,
  listUserSkillNames,
  writeUserSkill,
  isValidSkillName,
  MAX_DESCRIPTION_LENGTH,
} from "@/src/mastra/skills/loader";
import { extractSkillZip } from "@/src/mastra/skills/zip";
import { isCrossSiteMutation } from "@/lib/server/request-security";

/** Skills disponíveis para a UI (popover do composer). user = criada pelo usuário. */
export async function GET() {
  const skills = loadSkills(true);
  const userNames = new Set(listUserSkillNames());
  return Response.json({
    skills: skills.map((s) => ({
      name: s.name,
      description: s.description,
      user: userNames.has(s.name),
    })),
  });
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

/**
 * POST /api/skills — cria skills de usuário SOMENTE por upload de arquivo
 * (multipart/form-data, campo "file"):
 *   - .md/.markdown: SKILL.md completo (frontmatter name/description + corpo)
 *   - .zip: skill empacotada (SKILL.md na raiz ou em uma subpasta única)
 *
 * Criação via JSON e pelo agente não são permitidas: gravar uma skill exige
 * uma ação explícita de upload nesta rota.
 */
export async function POST(req: Request) {
  try {
    if (isCrossSiteMutation(req)) {
      return Response.json({ error: "Origem não permitida" }, { status: 403 });
    }
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
      return Response.json({ error: "arquivo muito grande (máx 5 MB)" }, { status: 413 });
    }
    const contentType = req.headers.get("content-type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
      return Response.json(
        {
          error: "Envie um arquivo via multipart/form-data (campo 'file'): .md ou .zip.",
        },
        { status: 400 },
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "campo 'file' é obrigatório" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json({ error: "arquivo muito grande (máx 5 MB)" }, { status: 400 });
    }
    const lower = file.name.toLowerCase();

    if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
      const raw = await file.text();
      const parsed = parseSkillMd(raw);
      if (!parsed) {
        return Response.json(
          {
            error:
              "SKILL.md inválido: precisa de frontmatter com name e description (name em kebab-case)",
          },
          { status: 400 },
        );
      }
      const path = writeUserSkill(parsed.name, parsed.description, parsed.body);
      return Response.json({ ok: true, name: parsed.name, path });
    }

    if (lower.endsWith(".zip")) {
      const result = extractSkillZip(Buffer.from(await file.arrayBuffer()));
      return Response.json({ ok: true, ...result });
    }

    return Response.json(
      { error: "Formato não suportado: envie .md, .markdown ou .zip" },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao importar skill";
    return Response.json({ error: message }, { status: 400 });
  }
}

/** SKILL.md cru → { name, description, body } (frontmatter mínimo). */
function parseSkillMd(raw: string): { name: string; description: string; body: string } | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const fm: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) fm[kv[1].trim()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  if (!fm.name || !fm.description) return null;
  if (!isValidSkillName(fm.name)) return null;
  if (fm.description.length > MAX_DESCRIPTION_LENGTH) return null;
  return { name: fm.name, description: fm.description, body: m[2].trim() };
}
