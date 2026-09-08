import {
  loadSkills,
  listSkillFiles,
  writeUserSkillDocument,
  DuplicateSkillError,
  assertSkillNameAvailable,
} from "@/src/mastra/skills/loader";
import { parseAgentSkill } from "@/src/mastra/skills/spec";
import { extractSkillZip } from "@/src/mastra/skills/zip";
import { isCrossSiteMutation } from "@/lib/server/request-security";
import { getNullainSession } from "@/lib/server/nullain-auth";

/** Skills disponíveis para a UI (popover do composer). user = criada pelo usuário. */
export async function GET(req: Request) {
  const session = await getNullainSession(req.headers).catch(() => null);
  const skills = loadSkills(true, session?.user.id);
  return Response.json({
    skills: skills.map((s) => {
      const files = listSkillFiles(s);
      return {
        name: s.name,
        description: s.description,
        displayName: s.displayName,
        summary: s.summary,
        source: s.source,
        user: s.source === "user",
        native: s.source === "native",
        resourceCount: files.length,
        resourceKinds: [
          ...new Set(
            files
              .filter((file) => file.includes("/"))
              .map((file) => file.slice(0, file.indexOf("/"))),
          ),
        ],
      };
    }),
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
    const session = await getNullainSession(req.headers);
    if (!session)
      return Response.json({ error: "Entre na sua conta para importar skills." }, { status: 401 });
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
      const parsed = parseAgentSkill(raw);
      assertSkillNameAvailable(parsed.frontmatter.name, session.user.id);
      const result = writeUserSkillDocument(session.user.id, raw);
      return Response.json({ ok: true, name: parsed.frontmatter.name, created: result.created });
    }

    if (lower.endsWith(".zip")) {
      const result = extractSkillZip(Buffer.from(await file.arrayBuffer()), session.user.id);
      return Response.json({ ok: true, skillName: result.skillName, files: result.files });
    }

    return Response.json(
      { error: "Formato não suportado: envie .md, .markdown ou .zip" },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao importar skill";
    return Response.json(
      { error: message },
      { status: error instanceof DuplicateSkillError ? 409 : 400 },
    );
  }
}
