/* Skills in Demand Visa (Subclass 482) context overrides.
 * Shared page contracts live in questionnaireBuiltInTemporaryWorkEnrichment.js.
 * This layer only encodes 482-specific behavior: five-year employment wording
 * and the absence of the 186-only `visa_held` field. Spouse Education and
 * Language are excluded at the built-in page filter stage.
 */
import {
  applySharedTemporaryWorkPageEnrichment,
  enrichEmploymentPage,
  finalizeTemporaryWorkEnrichment,
} from "./questionnaireBuiltInTemporaryWorkEnrichment.js";

export function applyQuestionnaireBuiltInTemporaryWork482Enrichment(pages) {
  return applySharedTemporaryWorkPageEnrichment(pages).map((page) => {
    if (page.route !== "/intake/temporary-work/main-applicant/employment") return page;
    return enrichEmploymentPage(page, { years: 5, includeVisaHeld: false });
  });
}

export function finalizeTemporaryWork482Enrichment(pages) {
  return finalizeTemporaryWorkEnrichment(pages);
}
