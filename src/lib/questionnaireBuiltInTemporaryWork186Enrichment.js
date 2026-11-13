/* Employer Nomination Visa (Subclass 186) context overrides.
 * Shared page contracts live in questionnaireBuiltInTemporaryWorkEnrichment.js.
 * This layer owns only ten-year employment wording and the 186-only
 * Australia-conditional `visa_held` field.
 */
import {
  applySharedTemporaryWorkPageEnrichment,
  enrichEmploymentPage,
  finalizeTemporaryWorkEnrichment,
} from "./questionnaireBuiltInTemporaryWorkEnrichment.js";

export function applyQuestionnaireBuiltInTemporaryWork186Enrichment(pages) {
  return applySharedTemporaryWorkPageEnrichment(pages).map((page) => {
    if (page.route !== "/intake/temporary-work/main-applicant/employment") return page;
    return enrichEmploymentPage(page, { years: 10, includeVisaHeld: true });
  });
}

export function finalizeTemporaryWork186Enrichment(pages) {
  return finalizeTemporaryWorkEnrichment(pages);
}
