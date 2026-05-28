/**
 * Builds structured, profile-aware sections from raw questionnaire data.
 *
 * Each profile in `profiles[]` becomes a top-level section titled
 * "Applicant N (Role) — Full Name". Their data comes from `profiles_data[profileId]`
 * or from legacy `temporary_work_*` keys for the main applicant.
 *
 * Shared sections (visas, travel, health, character, etc.) are grouped
 * under a virtual "All Applicants" section.
 */

// Format key from camelCase/snake_case to Title Case
export function formatLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/** Human-readable relationship label */
function relationshipLabel(rel) {
  const map = {
    main_applicant: "Main Applicant",
    spouse: "Spouse",
    de_facto: "De Facto Partner",
    child: "Child",
    other: "Other",
  };
  return map[rel] || formatLabel(rel);
}

/** Build a display name from a profile object */
function profileDisplayName(profile) {
  const parts = [profile.given_names, profile.family_name].filter(Boolean);
  return parts.join(" ") || "Unknown";
}

/** Keys that belong to the shared "All Applicants" group */
const ALL_APPLICANTS_KEYS = new Set([
  "allApplicants",
  "temporary_work_visas",
  "temporary_work_travel",
  "temporary_work_countries_of_residence",
  "temporary_work_health",
  "temporary_work_character",
  "temporary_work_contact_details",
]);

/** Legacy keys that map to main-applicant sub-sections */
const MAIN_APPLICANT_LEGACY_KEYS = new Set([
  "temporary_work_details",
  "temporary_work_identity",
  "temporary_work_other_names",
  "temporary_work_employment",
  "temporary_work_education",
  "temporary_work_skills",
  "temporary_work_language",
  "temporary_work_contact_details",
]);

/** Sub-section key → display title */
const SUBSECTION_TITLES = {
  details: "Details",
  identity: "Identity",
  other_names: "Other Names",
  contact_details: "Contact Details",
  employment: "Employment",
  education: "Education",
  skills: "Skills",
  language: "Language",
  custody: "Custody",
  passport: "Passport",
  citizenship: "Citizenship",
  health: "Health",
};

/** Shared section key → display title */
const SHARED_SECTION_TITLES = {
  temporary_work_visas: "Visas",
  temporary_work_travel: "Travel History",
  temporary_work_countries_of_residence: "Countries of Residence",
  temporary_work_health: "Health",
  temporary_work_character: "Character",
  temporary_work_contact_details: "Contact Details",
  allApplicants: "All Applicants",
};

/**
 * Build structured sections from raw questionnaire data.
 *
 * Returns an array of section objects:
 *   { key, title, data, category, subSections?: [{ key, title, data }] }
 *
 * Categories: "allApplicants" | "applicant" | "nonMigrating" | "other"
 */
export function buildStructuredSections(data) {
  if (!data || typeof data !== "object") return [];

  const profiles = Array.isArray(data.profiles) ? data.profiles : [];
  const profilesData = data.profiles_data || {};
  const nonMigratingMembers = Array.isArray(data.non_migrating_members)
    ? data.non_migrating_members
    : [];
  const nonMigratingData = data.non_migrating_data || {};

  const sections = [];
  const usedKeys = new Set(["visaContext", "id", "profiles", "profiles_data", "non_migrating_members", "non_migrating_data"]);

  // --- 1. Profile-based sections ---
  const sortedProfiles = [...profiles].sort((a, b) => {
    const order = { main_applicant: 0, spouse: 1, de_facto: 1, child: 2, other: 3 };
    return (order[a.relationship] ?? 4) - (order[b.relationship] ?? 4);
  });

  sortedProfiles.forEach((profile) => {
    const role = relationshipLabel(profile.relationship);
    const name = profileDisplayName(profile);
    const sectionKey = `profile:${profile.id}`;
    const title = name && name !== "Unknown" ? `${name} (${role})` : role;

    // Gather data for this profile
    let profileSectionData = profilesData[profile.id] || null;

    // For main applicant, also check legacy keys
    if (profile.relationship === "main_applicant" && !profileSectionData) {
      const legacyData = {};
      MAIN_APPLICANT_LEGACY_KEYS.forEach((lk) => {
        if (data[lk]) {
          const subKey = lk.replace("temporary_work_", "");
          legacyData[subKey] = data[lk];
          usedKeys.add(lk);
        }
      });
      if (Object.keys(legacyData).length > 0) {
        profileSectionData = legacyData;
      }
    }

    if (profileSectionData) {
      // Build sub-sections from the profile data
      const subSections = Object.entries(profileSectionData)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([subKey, subData]) => ({
          key: `${sectionKey}.${subKey}`,
          title: SUBSECTION_TITLES[subKey] || formatLabel(subKey),
          data: subData,
        }));

      sections.push({
        key: sectionKey,
        title,
        data: profileSectionData,
        category: "applicant",
        profileId: profile.id,
        relationship: profile.relationship,
        subSections,
      });
    }

    // Mark legacy keys as used even if profiles_data exists
    if (profile.relationship === "main_applicant") {
      MAIN_APPLICANT_LEGACY_KEYS.forEach((lk) => usedKeys.add(lk));
    }
  });

  // --- 2. All Applicants (shared sections) ---
  const sharedEntries = Object.entries(data).filter(
    ([key]) => ALL_APPLICANTS_KEYS.has(key) && !usedKeys.has(key)
  );

  if (sharedEntries.length > 0) {
    // If there's a single "allApplicants" key containing nested sub-sections
    const allApplicantsEntry = sharedEntries.find(([key]) => key === "allApplicants");
    if (allApplicantsEntry) {
      const allAppData = allApplicantsEntry[1];
      if (typeof allAppData === "object" && allAppData !== null && !Array.isArray(allAppData)) {
        const subSections = Object.entries(allAppData)
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([subKey, subData]) => ({
            key: `allApplicants.${subKey}`,
            title: SUBSECTION_TITLES[subKey] || formatLabel(subKey),
            data: subData,
          }));

        sections.push({
          key: "allApplicants",
          title: "All Applicants",
          data: allAppData,
          category: "allApplicants",
          subSections,
        });
      } else {
        sections.push({
          key: "allApplicants",
          title: "All Applicants",
          data: allAppData,
          category: "allApplicants",
        });
      }
      sharedEntries.forEach(([key]) => usedKeys.add(key));
    } else {
      // Individual shared keys (legacy temporary_work_* style)
      const subSections = sharedEntries
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([key, value]) => ({
          key,
          title: SHARED_SECTION_TITLES[key] || formatLabel(key),
          data: value,
        }));

      if (subSections.length > 0) {
        const combinedData = {};
        sharedEntries.forEach(([key, value]) => {
          combinedData[key] = value;
        });

        sections.push({
          key: "allApplicants",
          title: "All Applicants",
          data: combinedData,
          category: "allApplicants",
          subSections,
        });
      }
      sharedEntries.forEach(([key]) => usedKeys.add(key));
    }
  }

  // --- 3. Non-migrating members ---
  nonMigratingMembers.forEach((member, idx) => {
    const memberData = nonMigratingData[member.id] || null;
    const name = [member.given_names, member.family_name].filter(Boolean).join(" ") || `Member ${idx + 1}`;
    const sectionKey = `nonMigrating:${member.id}`;

    if (memberData) {
      const subSections = Object.entries(memberData)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([subKey, subData]) => ({
          key: `${sectionKey}.${subKey}`,
          title: SUBSECTION_TITLES[subKey] || formatLabel(subKey),
          data: subData,
        }));

      sections.push({
        key: sectionKey,
        title: `Non-migrating Member ${idx + 1} — ${name}`,
        data: memberData,
        category: "nonMigrating",
        subSections,
      });
    }
    usedKeys.add(`non_migrating_data`);
  });

  // --- 4. Remaining uncategorized keys ---
  const remaining = Object.entries(data).filter(
    ([key, value]) =>
      !usedKeys.has(key) &&
      value !== null &&
      value !== undefined &&
      value !== "" &&
      key !== "visaContext" &&
      key !== "id"
  );

  remaining.forEach(([key, value]) => {
    sections.push({
      key,
      title: formatLabel(key),
      data: value,
      category: "other",
    });
  });

  return sections;
}
