import { ownerFromRequest, unauthorized } from "../../../lib/auth";
import { loadPlan } from "../../../lib/workspace";

export async function GET(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();

  try {
    return Response.json({ plan: await loadPlan(owner) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to calculate plan." }, { status: 500 });
  }
}
