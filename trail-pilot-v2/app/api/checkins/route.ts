import { body, json, num, text, withUser } from "@/lib/api";
import { resolveToday, saveCheckin } from "@/lib/service";
import { ZONES, type Zone } from "@/lib/engine/legs";

export const POST = withUser(async (user, req) => {
  const b = await body(req);
  const today = resolveToday(typeof b.today === "string" ? b.today : null);
  const zones = Array.isArray(b.painZones) ? [...new Set(b.painZones.filter((z): z is Zone => typeof z === "string" && z in ZONES))].slice(0, 6) : [];
  const decision = await saveCheckin(user.id, today, {
    sleep: num(b.sleep, 1, 5, "Sommeil")!, legs: num(b.legs, 1, 5, "Jambes")!,
    motivation: num(b.motivation, 1, 5, "Motivation")!, pain: num(b.pain, 0, 2, "Douleur")! as 0 | 1 | 2,
    note: text(b.note, 500),
  }, { zones, consent: b.healthConsent === true }, {
    sleepH: num(b.sleepH, 2, 14, "Durée de sommeil", true), rhr: num(b.rhr, 30, 120, "FC au réveil", true), hrv: num(b.hrv, 5, 250, "VFC", true),
  });
  return json({ decision });
});
