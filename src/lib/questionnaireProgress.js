const MAIN_APPLICANT_PROGRESS_SUBPAGES = [
  { key: "details", segments: ["details"] },
  { key: "other_names", segments: ["other", "other-names", "other-details"] },
  { key: "identity", segments: ["identity"] },
  { key: "contact_details", segments: ["contact-details", "contact_details"] },
  { key: "employment", segments: ["employment"] },
  { key: "education", segments: ["education"] },
  { key: "skills", segments: ["skills"] },
  { key: "language", segments: ["language"] },
];

const SPOUSE_PROGRESS_SUBPAGES = [
  { key: "details", segments: ["details"] },
  { key: "other_names", segments: ["other", "other-names", "other-details"] },
  { key: "identity", segments: ["identity"] },
];

const EMPLOYER_NOMINATION_SPOUSE_PROGRESS_SUBPAGES = [
  ...SPOUSE_PROGRESS_SUBPAGES,
  { key: "education", segments: ["education"] },
  { key: "language", segments: ["language"] },
];

const CHILD_PROGRESS_SUBPAGES = [
  { key: "details", segments: ["details"] },
  { key: "other_names", segments: ["other", "other-names", "other-details"] },
  { key: "identity", segments: ["identity"] },
  { key: "custody", segments: ["custody"] },
];

const ALL_APPLICANTS_PROGRESS_SUBPAGES = [
  { key: "visas", segments: ["visas"] },
  { key: "travel", segments: ["travel-history", "travel"] },
  { key: "countries_of_residence", segments: ["countries-of-residence", "countries_of_residence"] },
  { key: "health", segments: ["health"] },
  { key: "character", segments: ["character"] },
];

function sortProfiles(profiles) {
  const order = { main_applicant: 0, spouse: 1, de_facto: 1, child: 2, other: 3 };
  return [...profiles].sort((a, b) => {
    return (order[a.relationship] ?? 4) - (order[b.relationship] ?? 4);
  });
}

function normalizeCompletionKey(key) {
  const raw = String(key || "").trim();
  if (!raw || raw === "updatedAt") return [];

  const [pathPart, queryPart = ""] = raw.replace(/^\/+/, "").split("?", 2);
  const path = pathPart.replace(/^intake\//, "");
  const variants = new Set([raw, raw.replace(/^\/+/, ""), pathPart, path]);

  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    const profileId = params.get("profileId");
    if (profileId) {
      variants.add(`${pathPart}?profileId=${profileId}`);
      variants.add(`${path}?profileId=${profileId}`);
    }
  }

  return [...variants].filter(Boolean);
}

function completedKeySet(completion) {
  const keys = new Set();
  Object.entries(completion || {}).forEach(([key, value]) => {
    if (value !== true) return;
    normalizeCompletionKey(key).forEach((variant) => keys.add(variant));
  });
  return keys;
}

function isCandidateCompleted(candidate, completedKeys) {
  return normalizeCompletionKey(candidate).some((variant) => {
    if (completedKeys.has(variant)) return true;

    for (const completedKey of completedKeys) {
      if (completedKey.startsWith(`${variant}__`)) return true;
    }

    return false;
  });
}

function isSectionCompleted(section, completedKeys) {
  return section.candidates.some((candidate) =>
    isCandidateCompleted(candidate, completedKeys)
  );
}

function pushStaticSection(sections, key) {
  sections.push({
    key,
    candidates: [`/intake/${key}`, key],
  });
}

function profilePathForRelationship(relationship) {
  if (relationship === "spouse" || relationship === "de_facto") {
    return "spouse-partner";
  }

  return "main-applicant";
}

function subpagesForProfile(profile, visaContext) {
  if (profile.relationship === "child") return CHILD_PROGRESS_SUBPAGES;
  if (profile.relationship === "spouse" || profile.relationship === "de_facto") {
    return visaContext === "186"
      ? EMPLOYER_NOMINATION_SPOUSE_PROGRESS_SUBPAGES
      : SPOUSE_PROGRESS_SUBPAGES;
  }

  return MAIN_APPLICANT_PROGRESS_SUBPAGES;
}

function profileSectionCandidates(profile, subpage) {
  const candidates = [];

  subpage.segments.forEach((segment) => {
    if (profile.relationship === "child") {
      const path = `temporary-work/children/${profile.id}/${segment}`;
      candidates.push(path, `/intake/${path}`);
    } else {
      const profilePath = profilePathForRelationship(profile.relationship);
      const path = `temporary-work/${profilePath}/${segment}`;
      candidates.push(
        path,
        `/intake/${path}`,
        `${path}?profileId=${profile.id}`,
        `/intake/${path}?profileId=${profile.id}`
      );
    }
  });

  candidates.push(
    `temporary_work_${subpage.key}__${profile.id}`,
    `temporary_work_${subpage.key}__profileId=${profile.id}`
  );

  if (profile.relationship === "main_applicant") {
    candidates.push(`temporary_work_${subpage.key}`);
  }

  return candidates;
}

function pushProfileSections(sections, profile, visaContext) {
  subpagesForProfile(profile, visaContext).forEach((subpage) => {
    sections.push({
      key: `profile:${profile.id}:${subpage.key}`,
      candidates: profileSectionCandidates(profile, subpage),
    });
  });
}

function pushAllApplicantSections(sections) {
  ALL_APPLICANTS_PROGRESS_SUBPAGES.forEach((subpage) => {
    const candidates = [];
    subpage.segments.forEach((segment) => {
      const path = `temporary-work/all-applicants/${segment}`;
      candidates.push(path, `/intake/${path}`);
    });
    candidates.push(`temporary_work_${subpage.key}`, `allApplicants.${subpage.key}`);
    sections.push({
      key: `allApplicants:${subpage.key}`,
      candidates,
    });
  });
}

export function buildTemporaryWorkProgressSections(questionnaire = {}) {
  const sections = [];
  const visaContext = String(questionnaire?.visaContext || "");
  const profiles = sortProfiles(
    Array.isArray(questionnaire?.profiles) ? questionnaire.profiles : []
  );

  pushStaticSection(sections, "temporary-work/start");
  pushStaticSection(sections, "temporary-work/profile");
  pushStaticSection(sections, "temporary-work/non-migrating");

  profiles.forEach((profile) => {
    if (!profile?.id) return;
    pushProfileSections(sections, profile, visaContext);
  });

  pushAllApplicantSections(sections);

  return sections;
}

export function calculateTemporaryWorkProgress(completion = {}, questionnaire = {}) {
  const sections = buildTemporaryWorkProgressSections(questionnaire);
  const completedKeys = completedKeySet(completion);
  const completedSections = sections.filter((section) =>
    isSectionCompleted(section, completedKeys)
  ).length;
  const totalSections = sections.length;
  const percentage =
    totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0;

  return {
    completedSections,
    totalSections,
    percentage: Math.min(100, percentage),
  };
}

export function countTrueCompletionKeys(completion = {}) {
  return Object.entries(completion).filter(([key, value]) => {
    return key !== "updatedAt" && value === true;
  }).length;
}
