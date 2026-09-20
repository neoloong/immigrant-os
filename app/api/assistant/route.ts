import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { completedActions, profiles } from "../../../db/schema";
import { ownerFromRequest, unauthorized } from "../../../lib/auth";
import type { ImmigrationProfile } from "../../../lib/profile";
import { buildPlan } from "../../../lib/rules";

export async function POST(request: Request) {
  const owner = ownerFromRequest(request);
  if (!owner) return unauthorized();

  try {
    await ensureDatabase();
    const payload = (await request.json()) as { question?: string };
    const question = String(payload.question ?? "").trim().slice(0, 600);
    if (!question) return Response.json({ error: "Ask a question first." }, { status: 400 });
    const db = getDb();
    const [profile] = await db.select().from(profiles).where(eq(profiles.owner, owner)).limit(1);
    if (!profile) return Response.json({ error: "Complete your profile before asking a personalized question." }, { status: 400 });
    const completed = await db.select({ actionKey: completedActions.actionKey }).from(completedActions)
      .where(eq(completedActions.owner, owner));
    const plan = buildPlan(profile as ImmigrationProfile, completed.map((row) => row.actionKey));
    const normalized = question.toLowerCase();
    let relevant = plan.items.filter((item) => !item.completed).slice(0, 3);

    if (/opt|stem|ead/.test(normalized)) relevant = plan.items.filter((item) => /opt|ead/.test(item.id));
    else if (/i-?94|status|expire|expiration/.test(normalized)) relevant = plan.items.filter((item) => /i94|passport|expiry|end/.test(item.id));
    else if (/citizen|n-?400|naturaliz/.test(normalized)) relevant = plan.items.filter((item) => item.id.includes("n400"));
    else if (/green card|i-?90|renew/.test(normalized)) relevant = plan.items.filter((item) => /i90|gc-/.test(item.id));
    else if (/missing|document|upload/.test(normalized)) relevant = [];

    const answer = relevant.length
      ? `Based on your saved ${plan.stageLabel} profile, ${relevant.map((item) => `${item.title}${item.dueDate ? ` is ${item.dueDate}` : ""}`).join("; ")}. Open each action to see the inputs, confidence level, and governing source.`
      : plan.missingFields.length
        ? `I cannot calculate that reliably yet. Add: ${plan.missingFields.join(", ")}. I will recalculate the plan after you save the profile.`
        : `Your ${plan.stageLabel} profile is complete enough for the supported checks. This assistant only answers from the deterministic plan today; questions requiring strategy or legal judgment should go to a DSO, employer counsel, or immigration attorney.`;

    const sources = Array.from(new Map(relevant.map((item) => [item.source.url, item.source])).values());
    return Response.json({
      answer,
      sources,
      limitations: "General administrative information only; not legal advice or a complete eligibility determination.",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to answer." }, { status: 500 });
  }
}
