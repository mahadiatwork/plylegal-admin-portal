const ROLE_ORDER = { main_applicant: 0, spouse: 1, child: 2, other: 3 };
const ROLE_TITLES = { main_applicant: "Main Applicant", spouse: "Spouse/Partner", child: "Child", other: "Dependent" };
const OTHER_ROUTES = ["other", "other-details", "other-names"];

function own(value, key) {
  return value != null && Object.prototype.hasOwnProperty.call(value, key);
}

function nested(value, path) {
  // Older partner drafts sometimes persisted dotted keys literally.
  if (own(value, path)) return value[path];
  return String(path || "").split(".").filter(Boolean).reduce((current, key) => (
    own(current, key) ? current[key] : undefined
  ), value);
}

function record(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function hasValue(value) {
  if (Array.isArray(value)) return value.some(hasValue);
  if (record(value)) return Object.values(value).some(hasValue);
  return value !== undefined && value !== null && value !== "";
}

function roleForProfile(profile) {
  return ["spouse", "de_facto", "partner"].includes(profile?.relationship)
    ? "spouse" : profile?.relationship === "child" ? "child"
      : profile?.relationship === "main_applicant" ? "main_applicant" : "other";
}

function pageRole(page) {
  const metadataRole = page?.metadata?.profileRole;
  if (metadataRole) return metadataRole === "main" ? "main_applicant" : metadataRole;
  const route = String(page?.route || "");
  if (/\/non-migrating\/[^/]+\//.test(route)) return "non_migrating";
  if (route.includes("/children/") && !route.endsWith("/children/start")) return "child";
  if (route.includes("/spouse-partner/")) return "spouse";
  if (route.includes("/main-applicant/")) return "main_applicant";
  return null;
}

function pageSection(page) {
  const suffix = String(page?.route || "").split("?")[0].split("/").pop();
  if (OTHER_ROUTES.includes(suffix)) return "other";
  return String(suffix || "").replace(/-/g, "_");
}

function navigationTitle(page) {
  return page?.metadata?.navigationTitle || page?.metadata?.originalDisplayTitle || page?.title;
}

function sectionAliases(page) {
  const section = pageSection(page);
  const stripped = String(page?.sectionKey || "")
    .replace(/^(?:temporary_work_|protection_|partner_)(?:spouse_)?/, "")
    .split(".").pop();
  return [...new Set([
    page?.sectionKey, page?.metadata?.profileSection, stripped, section,
    ...(section === "other" ? ["other", "other_names", "otherNames"] : []),
    ...(section === "contact_details" ? ["contact_details", "contactDetails", "contact"] : []),
    ...(section === "details" ? ["details", "personalDetails", "personal_details"] : []),
  ].filter(Boolean))];
}

function legacyProfilePaths(visaType, role, section) {
  if (role === "child" || role === "other") return [];
  const spouse = role === "spouse";
  if (visaType === "partner") {
    const nestedSection = section === "other" ? "otherNames" : section;
    const prefix = spouse ? "spousePartner" : "mainApplicant";
    return [`${prefix}.${nestedSection}`, `partner_${spouse ? "spouse_" : ""}${section}`];
  }
  const prefix = `${visaType === "protection" ? "protection" : "temporary_work"}_${spouse ? "spouse_" : ""}`;
  return [`${prefix}${section}`, ...(section === "other" ? [`${prefix}other_names`] : [])];
}

function mergeRecords(records) {
  return records.filter(record).reduce((result, value) => ({ ...result, ...value }), {});
}

function profileValues(draft, page, profile, visaType, allowLegacy) {
  const aliases = sectionAliases(page);
  const stored = draft?.profiles_data?.[profile.id] || {};
  const existingAlias = aliases.find((key) => record(nested(stored, key)));
  const section = pageSection(page);
  const legacy = allowLegacy
    ? mergeRecords([...legacyProfilePaths(visaType, roleForProfile(profile), section).reverse(), page?.metadata?.storagePath].filter(Boolean).map((path) => nested(draft, path)))
    : {};
  // A saved empty section is authoritative; it must not resurrect stale legacy answers.
  let saved = existingAlias === undefined ? legacy : nested(stored, existingAlias);
  if (page.metadata?.renderer === "legacy" && ["partner", "protection"].includes(visaType) && roleForProfile(profile) === "main_applicant") {
    const legacyOnly = section === "family" || (visaType === "protection" && ["education", "employment"].includes(section));
    if (legacyOnly) saved = legacy;
    else if (["other", "identity"].includes(section) && existingAlias !== page.sectionKey) saved = { ...legacy, ...saved };
  }
  if (section === "custody") {
    const values = { ...saved };
    const yesNo = (value) => typeof value === "boolean" ? value ? "yes" : "no" : value;
    values.under_18 = yesNo(saved?.under_18);
    ["primary_custody", "other_person_rights", "travel_impediments"].forEach((key) => {
      if (record(saved?.[key])) {
        values[`${key}_has`] = yesNo(saved[key].has);
        values[`${key}_details`] = saved[key].details;
        if (!page.questions?.some((question) => question.answerKey === key)) delete values[key];
      }
    });
    return values;
  }
  if (section !== "details") return { ...(saved || {}) };
  const details = { ...saved };
  ["family_name", "given_names", "gender", "sex", "birth_day", "birth_month", "birth_year", "country_of_birth"].forEach((key) => {
    if (!hasValue(details[key]) && hasValue(profile[key])) details[key] = profile[key];
  });
  // Temporary-work main/spouse forms overlay names and gender from the roster.
  if (visaType === "temporary-work" && ["main_applicant", "spouse"].includes(roleForProfile(profile))) {
    ["family_name", "given_names", "gender"].forEach((key) => {
      if (hasValue(profile[key])) details[key] = profile[key];
    });
  }
  if (visaType === "temporary-work" && roleForProfile(profile) === "spouse") {
    ["birth_day", "birth_month", "birth_year"].forEach((key) => {
      if (hasValue(profile[key])) details[key] = profile[key];
    });
  }
  // Shipped temporary-work forms migrate earlier citizenship rows from Identity to Details.
  if (visaType === "temporary-work" && !details.citizenships?.length) {
    const identity = stored.temporary_work_identity || stored.identity || (allowLegacy ? nested(draft, legacyProfilePaths(visaType, roleForProfile(profile), "identity")[0]) : {});
    if (identity?.citizenships?.length) {
      details.citizenships = identity.citizenships;
      if (!details.citizenship_other_than_birth) details.citizenship_other_than_birth = "yes";
    }
  }
  return details;
}

function displayName(profile, saved = {}) {
  return [profile?.given_names || saved.given_names, profile?.family_name || saved.family_name]
    .filter(Boolean).join(" ").trim() || profile?.name || "Unnamed Applicant";
}

function getProfiles(draft, visaType) {
  const savedProfiles = Array.isArray(draft?.profiles) ? draft.profiles.filter(record) : [];
  if (savedProfiles.length) return savedProfiles.map((profile, index) => ({ ...profile, id: String(profile.id ?? `saved-profile-${index}`) }));
  const profiles = [];
  ["main_applicant", "spouse"].forEach((role) => {
    const details = mergeRecords(legacyProfilePaths(visaType, role, "details").reverse().map((path) => nested(draft, path)));
    if (hasValue(details)) profiles.push({ ...details, id: `legacy-${role}`, relationship: role, legacy: true });
  });
  const children = draft?.temporary_work_children?.children || draft?.protection_children?.children || draft?.children?.children || [];
  if (Array.isArray(children)) children.filter(record).forEach((child, index) => {
    profiles.push({ ...child, id: String(child.id ?? `legacy-child-${index}`), relationship: "child", legacy: true });
  });
  return profiles;
}

function expandPage(page, profileId, draft = {}) {
  function expandRoute(value) {
    return String(value || "")
      .replace(/(\/(?:children|non-migrating)\/)[^/]+(?=\/)/, (_, prefix) => `${prefix}${profileId}`);
  }
  return {
    ...page,
    route: expandRoute(page.route),
    ...(page.completionKey ? { completionKey: expandRoute(page.completionKey) } : {}),
    questions: (page.questions || []).filter((question) => !question.metadata?.requiresSpouse || (draft.profiles || []).some((person) => roleForProfile(person) === "spouse")).map((question) => {
      if (!question.metadata?.labelTemplate) return question;
      const label = question.label === question.metadata?.originalLabel ? question.metadata.labelTemplate : question.label;
      if (!label?.includes("{spouseName}")) return question;
      const spouse = (draft.profiles || []).find((person) => roleForProfile(person) === "spouse");
      return { ...question, label: label.replaceAll("{spouseName}", spouse ? displayName(spouse) : "Spouse/Partner") };
    }),
  };
}

function normalizeCompletionKey(key) {
  const [pathPart, queryPart = ""] = String(key || "").replace(/^\/+/, "").split("?", 2);
  const path = pathPart.replace(/^intake\//, "").replace(/__profileId=/, "__");
  const profileId = new URLSearchParams(queryPart).get("profileId");
  return profileId ? `${path}__${profileId}` : path;
}

function routeAliases(route) {
  const section = String(route || "").split("/").pop();
  if (OTHER_ROUTES.includes(section)) return OTHER_ROUTES.map((alias) => route.replace(/[^/]+$/, alias));
  if (["travel", "travel-history"].includes(section)) return [route.replace(/[^/]+$/, "travel"), route.replace(/[^/]+$/, "travel-history")];
  return [route];
}

function completionCandidates(page, profile, visaType, allowLegacy = false) {
  const bases = [...new Set([page.completionKey, page.route, ...routeAliases(page.route)].filter(Boolean))];
  const result = [];
  const role = profile ? roleForProfile(profile) : null;
  if (profile) {
    bases.forEach((base) => result.push(`${base}__${profile.id}`, `${base}?profileId=${encodeURIComponent(profile.id)}`));
    sectionAliases(page).forEach((alias) => result.push(`${alias}__${profile.id}`));
    if (role === "child" || pageRole(page) === "non_migrating") {
      // These routes already identify a single child/member in the path.
      result.push(...bases);
    } else if (allowLegacy) {
      result.push(...bases);
      result.push(...legacyProfilePaths(visaType, role, pageSection(page)));
    }
  } else {
    result.push(...bases, page.sectionKey);
  }
  return [...new Set(result.filter(Boolean))];
}

function nonMigratingValues(draft, page, member) {
  const stored = { ...draft?.profiles_data?.[member.id], ...draft?.non_migrating_data?.[member.id] };
  const aliases = sectionAliases(page);
  const savedKey = aliases.find((key) => record(nested(stored, key)));
  const root = { ...member };
  const suffix = pageSection(page);
  let values;
  if (suffix === "details") {
    values = {
      relationship: member.relationship,
      relationship_status: member.relationship_status,
      sex: member.passport?.sex,
      dob_day: member.passport?.dob_day,
      dob_month: member.passport?.dob_month,
      dob_year: member.passport?.dob_year,
      place_of_birth_town: member.place_of_birth?.town_city,
      place_of_birth_state: member.place_of_birth?.state_province,
      place_of_birth_country: member.place_of_birth?.country,
      ...member.details,
    };
  } else if (suffix === "passport") {
    values = { ...member.passport, has_current_passport: member.has_current_passport };
  } else if (suffix === "citizenship") {
    values = {
      ...member.citizenship,
      citizenship_has_other: member.citizenship?.has_other,
      citizenship_countries: Array.isArray(member.citizenship?.countries) ? member.citizenship.countries.join(", ") : member.citizenship?.countries,
    };
  } else if (suffix === "other") {
    values = { other_names: member.other_names };
  } else {
    values = { ...root, ...(record(member[suffix]) ? member[suffix] : {}) };
  }
  return savedKey === undefined ? values : { ...nested(stored, savedKey) };
}

/** Match the client's validation evaluator exactly, including strict comparisons. */
export function isQuestionVisible(question, values = {}) {
  const conditions = question?.visibleIf || [];
  if (!conditions.length) return true;
  return conditions.every((condition) => {
    const value = values?.[condition.field];
    switch (condition.op) {
      case "equals": return value === condition.value;
      case "notEquals": return value !== condition.value;
      case "in": return Array.isArray(condition.value) && condition.value.includes(value);
      case "notIn": return Array.isArray(condition.value) && !condition.value.includes(value);
      case "exists": return value !== undefined && value !== null && value !== "";
      case "notExists": return value === undefined || value === null || value === "";
      default: return false;
    }
  });
}

export function getQuestionnaireAnswerDatePartNames(question) {
  return question?.parts || { day: `${question.answerKey}_day`, month: `${question.answerKey}_month`, year: `${question.answerKey}_year` };
}

function staticItem(visaType, suffix, title, data, questions) {
  const route = `/intake/${visaType}/${suffix}`;
  return {
    key: `${visaType}:${suffix}`, title, data,
    page: { id: `${visaType}-${suffix}`, title, route, questions },
    completionCandidates: [route],
  };
}

function sharedValues(draft, page, profiles) {
  const saved = nested(draft, page.sectionKey) ?? nested(draft, page.metadata?.storagePath) ?? {};
  if (page.metadata?.answerLayout !== "applicantLanguages") return saved;
  const ids = [...new Set([...profiles.map((profile) => String(profile.id)), ...Object.keys(saved)])];
  return { applicants: ids.map((id) => ({
    name: profiles.some((profile) => String(profile.id) === id) ? displayName(profiles.find((profile) => String(profile.id) === id)) : id,
    languages: Array.isArray(saved[id]) ? saved[id] : [],
  })) };
}

/** Build the same person/section navigation as the client's saved questionnaire. */
export function buildQuestionnaireAnswerGroups(definition, questionnaire = {}) {
  const draft = questionnaire || {};
  const visaType = definition?.visaType || draft.visaType || "temporary-work";
  const profiles = getProfiles(draft, visaType).sort((a, b) => (ROLE_ORDER[roleForProfile(a)] ?? 4) - (ROLE_ORDER[roleForProfile(b)] ?? 4));
  const actualProfiles = Array.isArray(draft.profiles) && draft.profiles.length > 0;
  const groups = [{
    key: "getting-started", title: "Getting Started", type: "standalone",
    items: [staticItem(visaType, "start", "Getting Started", { started: draft.started }, [
      { id: "started", answerKey: "started", label: "I am ready to begin the questionnaire", type: "checkbox" },
    ])],
  }, {
    key: "included-applicants", title: "Included Applicants", type: "standalone",
    items: [staticItem(visaType, "profile", "Included Applicants", { applicants: profiles.map((profile) => ({
      name: displayName(profile, draft.profiles_data?.[profile.id]?.details), relationship: ROLE_TITLES[roleForProfile(profile)] || profile.relationship,
    })) }, [{ id: "applicants", answerKey: "applicants", label: "Included applicants", type: "repeater" }])],
  }];
  const pages = [...(definition?.pages || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const sharedSourceCounts = pages.filter((page) => !pageRole(page) && page.metadata?.storagePath).reduce((counts, page) => {
    const path = page.metadata.storagePath;
    counts[path] = (counts[path] || 0) + 1;
    return counts;
  }, {});
  const memberPages = pages.filter((page) => pageRole(page) === "non_migrating");
  const members = Array.isArray(draft.non_migrating_members) ? draft.non_migrating_members.filter(record) : [];
  const roleCounts = profiles.reduce((counts, profile) => ({ ...counts, [roleForProfile(profile)]: (counts[roleForProfile(profile)] || 0) + 1 }), {});
  const shownProfiles = profiles.length ? profiles : [{ id: "empty-main-applicant", relationship: "main_applicant", placeholder: true }];
  shownProfiles.forEach((profile) => {
    const role = roleForProfile(profile);
    const allowLegacy = ["main_applicant", "spouse"].includes(role) && (roleCounts[role] === 1 || (profile.placeholder && !actualProfiles));
    const items = pages.filter((page) => pageRole(page) === (role === "other" ? "main_applicant" : role)).map((page) => {
      const expanded = expandPage(page, profile.id, draft);
      return {
        key: `profile:${profile.id}:${page.id}`, title: navigationTitle(page), profileId: profile.id,
        data: profileValues(draft, expanded, profile, visaType, allowLegacy), page: expanded,
        countsForProgress: page.metadata?.countsForProgress !== false && (visaType === "temporary-work" ? actualProfiles && role !== "other" : actualProfiles || role === "main_applicant"),
        completionCandidates: completionCandidates(expanded, profile, visaType, allowLegacy),
      };
    });
    if (role === "main_applicant") {
      const explicitOverview = pages.find((page) => page.route === `/intake/${visaType}/non-migrating`);
      const family = staticItem(visaType, "non-migrating", "Other Family", {
        ...draft.temporary_work_non_migrating,
        members: members.map((member) => ({ name: displayName(member, member.passport), relationship: member.relationship })),
      }, [
        { id: "has_other_family", answerKey: "has_other_family", label: "Does the applicant have other family members?", type: "yesNo" },
        { id: "members", answerKey: "members", label: "Other family members", type: "repeater" },
      ]);
      family.countsForProgress = visaType === "temporary-work" ? actualProfiles : true;
      if (explicitOverview) { family.page = explicitOverview; family.data = nested(draft, explicitOverview.sectionKey) || family.data; }
      const insertion = items.findIndex((item) => pageSection(item.page) === (visaType === "temporary-work" ? "contact_details" : "family"));
      items.splice(insertion >= 0 ? insertion + 1 : items.length, 0, family);
    }
    if (items.length) groups.push({
      key: `profile:${profile.id}`, title: profile.placeholder ? "Main Applicant" : displayName(profile, items.find((item) => pageSection(item.page) === "details")?.data),
      subtitle: ROLE_TITLES[role] || profile.relationship, type: "applicant", profileId: profile.id, items,
    });
  });
  members.forEach((member, index) => {
    const memberId = String(member.id ?? `member-${index}`);
    const identifiedMember = { ...member, id: memberId };
    const items = memberPages.map((page) => {
      const expanded = expandPage(page, memberId);
      return {
        key: `nonMigrating:${memberId}:${page.id}`, title: navigationTitle(page), profileId: memberId,
        page: expanded, data: nonMigratingValues(draft, page, identifiedMember),
        countsForProgress: page.metadata?.countsForProgress !== false && (actualProfiles || visaType !== "temporary-work"),
        completionCandidates: completionCandidates(expanded, identifiedMember, visaType),
      };
    });
    if (items.length) groups.push({ key: `nonMigrating:${memberId}`, title: displayName(member, member.passport), subtitle: `Other Family${member.relationship ? ` (${member.relationship.replace(/_/g, " ")})` : ""}`, type: "nonMigrating", items });
  });
  pages.filter((page) => !pageRole(page) && !/\/(?:start|profile|submit|non-migrating)$/.test(page.route || "")).forEach((page) => {
    const routeCategory = String(page.route || "").split("/")[3];
    const category = routeCategory === "all-applicants" ? "allApplicants" : routeCategory || "questionnaire";
    let group = groups.find((entry) => entry.key === category);
    if (!group) {
      group = { key: category, title: category === "allApplicants" ? "All Applicants" : category.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()), type: category === "allApplicants" ? "allApplicants" : "standalone", items: [] };
      groups.push(group);
    }
    const reviewPage = sharedSourceCounts[page.metadata?.storagePath] > 1
      ? { ...page, metadata: { ...page.metadata, sharedStorage: true } } : page;
    group.items.push({ key: `${category}:${page.id}`, title: navigationTitle(page), data: sharedValues(draft, page, profiles), page: reviewPage, countsForProgress: page.metadata?.countsForProgress !== false, completionCandidates: [...completionCandidates(page, null, visaType), page.metadata?.storagePath].filter(Boolean) });
  });
  return groups;
}

export function isQuestionnaireAnswerSectionComplete(item, completion = {}) {
  const normalized = new Map();
  Object.entries(completion || {}).forEach(([key, value]) => {
    if (typeof value === "boolean") normalized.set(normalizeCompletionKey(key), value);
  });
  for (const candidate of item?.completionCandidates || []) {
    const key = normalizeCompletionKey(candidate);
    if (normalized.has(key)) return normalized.get(key) === true;
  }
  return false;
}

export function calculateQuestionnaireAnswerProgress(groups = [], completion = {}) {
  const seen = new Set();
  const items = groups.flatMap((group) => group.items || []).filter((item) => {
    if (item.countsForProgress === false || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
  const completedSections = items.filter((item) => isQuestionnaireAnswerSectionComplete(item, completion)).length;
  const totalSections = items.length;
  return { completedSections, totalSections, percentage: totalSections ? Math.round(completedSections / totalSections * 100) : 0 };
}
