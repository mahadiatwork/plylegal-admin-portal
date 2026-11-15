import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { CRM_FIELD_CATALOG, serializeCrmFieldCatalog } from "../src/lib/crmFieldCatalog.js";
import { hasInvalidEnabledCrmMapping } from "../src/lib/questionnaireCrmContract.js";

const SCREENSHOT_FIELDS = {
  First_Name: "First Name", Last_Name: "Last Name", Preferred_Name: "Preferred Name", Gender: "Gender",
  Date_of_Birth: "Date of Birth", Nationality: "Citizenship", Country_of_Birth: "Country of Birth",
  City_Town_of_Birth: "City/Town of Birth", State_or_Province_of_Birth: "State or Province of Birth",
  Relationship_Status: "Relationship Status", Country_of_Passport: "Country of Passport", Passport_No: "Passport Number",
  Passport_Expiry_Date: "Passport Expiry Date", Country_of_Residence: "Country of Residence", Current_Visa: "Current Visa",
  Visa_Expiry_Date: "Current Visa Expiry Date", Email: "Email", Secondary_Email: "Secondary Email", Phone: "Phone",
  Mobile: "Mobile", Home_Phone: "Home Phone", Mailing_Street: "Street", Mailing_Suburb: "Suburb", Mailing_City: "Mailing City",
  Mailing_State: "Mailing Province", Mailing_Country: "Mailing Country", Mailing_Zip: "Post Code",
  Address_1_City: "Address - City", Address_1_Country_Region: "Address - Country / Region",
  Address_1_State_Province: "Address - State / Province", Address_1_Street_Address: "Address - Street Address",
  Address_1_Zip_Postal_Code: "Address - Zip / Postal Code",
};

test("admin Contacts catalog contains every screenshot field with its exact API name and label", () => {
  for (const [apiName, label] of Object.entries(SCREENSHOT_FIELDS)) {
    assert.equal(CRM_FIELD_CATALOG.Contacts[apiName]?.label, label, apiName);
  }
  assert.equal(Object.keys(CRM_FIELD_CATALOG.Contacts).length, Object.keys(SCREENSHOT_FIELDS).length);
  const serialized = serializeCrmFieldCatalog().modules.find((module) => module.apiName === "Contacts");
  assert.ok(serialized.fields.find((item) => item.apiName === "Passport_No").requiresLiveVerification);
  assert.equal(serialized.fields.find((item) => item.apiName === "First_Name").requiresLiveVerification, false);
});

test("admin and client Contacts catalogs list the same API names", () => {
  const clientPath = new URL("../../plylegal-client-portal/src/lib/crm/crmFieldCatalog.js", import.meta.url);
  if (!existsSync(clientPath)) return;
  const source = readFileSync(clientPath, "utf8");
  const clientNames = [...source.matchAll(/(?:contactField|field)\("([A-Za-z0-9_]+)"/g)].map((match) => match[1]);
  for (const apiName of Object.keys(SCREENSHOT_FIELDS)) assert.ok(clientNames.includes(apiName), `${apiName} missing in client catalog`);
});

function page(role, route) {
  return {
    id: `${role}-page`, route, sectionKey: "details", scope: "profile", metadata: { profileRole: role },
    questions: [{
      id: `${role}-city`, answerKey: "city_of_birth", type: "text",
      metadata: { crm: { mode: "field", target: "main_contact", module: "Contacts", fieldApiName: "City_Town_of_Birth", transform: "text" } },
    }],
  };
}

test("builder validation only allows main_contact mappings on main applicant pages", () => {
  const ok = hasInvalidEnabledCrmMapping({ pages: [page("main_applicant", "/intake/temporary-work/main-applicant/details")] });
  assert.deepEqual(ok, []);
  const spouse = hasInvalidEnabledCrmMapping({ pages: [page("spouse", "/intake/temporary-work/spouse-partner/details")] });
  assert.ok(spouse.some((issue) => /only allowed on main applicant pages/.test(issue)), spouse.join("\n"));
  const guessed = hasInvalidEnabledCrmMapping({ pages: [{
    ...page("main_applicant", "/intake/temporary-work/main-applicant/details"),
    questions: [{ id: "q", answerKey: "p", type: "text", metadata: { crm: { mode: "field", target: "main_contact", module: "Contacts", fieldApiName: "Passport_Number", transform: "text" } } }],
  }] });
  assert.ok(guessed.some((issue) => /approved CRM catalog/.test(issue)));
});
