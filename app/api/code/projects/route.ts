import {
  createProject,
  getProjectPath,
  listProjects,
  type NullainProject,
} from "@/lib/server/nullain-code-repository";
import { requireNullainSession } from "@/lib/server/nullain-auth";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";
import { nullainRoute } from "@/lib/server/nullain-route";

export const runtime = "nodejs";

function projectForClient(project: NullainProject) {
  return { ...project, directoryPath: getProjectPath(project) };
}

export const GET = nullainRoute(async (request: Request) => {
  const session = await requireNullainSession(request);
  return Response.json({ projects: listProjects(session.user.id).map(projectForClient) });
});

export const POST = nullainRoute(async (request: Request) => {
  if (isInvalidCookieMutationOrigin(request))
    return Response.json({ error: "Origem não permitida." }, { status: 403 });
  const session = await requireNullainSession(request);
  const body = (await request.json()) as { name?: unknown };
  try {
    return Response.json(
      { project: projectForClient(await createProject(session.user.id, body.name)) },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao criar projeto." },
      { status: 400 },
    );
  }
});
