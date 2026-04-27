/**
 * User-facing visa labels and Zoho deal → internal visa route mapping.
 * Replaces legacy "Temporary Work" / TSS wording with Skills in Demand (subclass 482) where appropriate.
 */

export const SKILLS_IN_DEMAND_TYPE_LABEL = "Skills in Demand (subclass 482)";

/**
 * Maps a Zoho CRM deal to the same visa code used by intake routes (`partner`, `protection`, `temporary-work`).
 */
export function mapZohoDealToVisaTypeCode(deal) {
  const dealName = (deal?.Deal_Name || deal?.DealName || "").toLowerCase();
  const visaType = (deal?.Visa_Type || deal?.visaType || deal?.Type || "").toLowerCase();

  if (dealName.includes("partner") || visaType.includes("partner")) {
    return "partner";
  }
  if (dealName.includes("protection") || visaType.includes("protection")) {
    return "protection";
  }
  if (
    dealName.includes("skills in demand") ||
    visaType.includes("skills in demand") ||
    dealName.includes("work") ||
    dealName.includes("temporary") ||
    visaType.includes("work") ||
    dealName.includes("tss")
  ) {
    return "temporary-work";
  }

  return "partner";
}

/**
 * Normalizes stored CRM visa type strings: legacy Temporary Work / TSS labels → Skills in Demand (482).
 * Leaves Employer Nomination (186) and other subclasses unchanged.
 */
export function normalizeSkillsInDemandTypeLabel(typeStr) {
  if (!typeStr || typeof typeStr !== "string") return typeStr;
  const lower = typeStr.toLowerCase();
  if (lower.includes("186") || lower.includes("employer nomination")) {
    return typeStr;
  }
  if (
    lower.includes("temporary work") ||
    lower.includes("temporary skill") ||
    lower.includes("skill shortage") ||
    (lower.includes("tss") && lower.includes("482")) ||
    (lower.includes("482") && lower.includes("temporary"))
  ) {
    return SKILLS_IN_DEMAND_TYPE_LABEL;
  }
  return typeStr;
}

/** Applications list / UI: prefer normalized Skills in Demand label. */
export function formatVisaApplicationType(app) {
  if (!app?.type?.trim()) return "N/A";
  return normalizeSkillsInDemandTypeLabel(app.type.trim()) || "N/A";
}
