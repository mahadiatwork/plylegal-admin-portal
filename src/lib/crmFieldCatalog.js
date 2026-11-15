export const CRM_MODULES = Object.freeze({
  Deals: "Deals",
  Contacts: "Contacts",
  Partner_Dependents: "Partner_Dependents",
});

export const CRM_TARGETS = Object.freeze({
  matter: "matter",
  main_contact: "main_contact",
  profile_record: "profile_record",
  portal_only: "portal_only",
});

export const CRM_TARGET_MODULES = Object.freeze({
  matter: CRM_MODULES.Deals,
  main_contact: CRM_MODULES.Contacts,
  profile_record: CRM_MODULES.Partner_Dependents,
});

export const CRM_TRANSFORMS = Object.freeze({
  text: "text",
  boolean: "boolean",
  picklist: "picklist",
  date_parts_to_iso: "date_parts_to_iso",
  number: "number",
  multiline_text: "multiline_text",
});

export const CRM_CLEAR_POLICIES = Object.freeze({
  preserve_when_empty: "preserve_when_empty",
  clear_when_empty: "clear_when_empty",
});

export const CRM_MAPPING_MODES = Object.freeze({
  field: "field",
  portal_only: "portal_only",
  unconfigured: "unconfigured",
});

export const CRM_CATALOG_SOURCE = "production_code";

function field(apiName, label, type, extra = {}) {
  return Object.freeze({
    apiName,
    label,
    type,
    source: CRM_CATALOG_SOURCE,
    ...extra,
  });
}

// Contacts fields that were identified from the Zoho Contacts layout screenshots.
// Names/labels come from that evidence only: their data type, writability and
// picklist values are NOT assumed. The sync service validates every value against
// the live field metadata (`crmFieldGate.js`) before it is written.
export const CRM_CONTACTS_SCREENSHOT_SOURCE = "zoho_contacts_screenshot";

function contactField(apiName, label, type, extra = {}) {
  return field(apiName, label, type, {
    source: CRM_CONTACTS_SCREENSHOT_SOURCE,
    requiresLiveVerification: true,
    ...extra,
  });
}

// KEEP IN SYNC with ply-legal-admin-portal/src/lib/crmFieldCatalog.js (Contacts block).
const CONTACTS_FIELDS = Object.freeze({
  // Already written by production code before the screenshot audit.
  First_Name: field("First_Name", "First Name", "text"),
  Last_Name: field("Last_Name", "Last Name", "text"),
  Gender: field("Gender", "Gender", "picklist", { picklistValues: Object.freeze(["Male", "Female"]) }),
  Date_of_Birth: field("Date_of_Birth", "Date of Birth", "date"),
  Email: field("Email", "Email", "text"),
  // Identified from the Contacts screenshots.
  Preferred_Name: contactField("Preferred_Name", "Preferred Name", "text"),
  Nationality: contactField("Nationality", "Citizenship", "text"),
  Country_of_Birth: contactField("Country_of_Birth", "Country of Birth", "text"),
  City_Town_of_Birth: contactField("City_Town_of_Birth", "City/Town of Birth", "text"),
  State_or_Province_of_Birth: contactField("State_or_Province_of_Birth", "State or Province of Birth", "text"),
  Relationship_Status: contactField("Relationship_Status", "Relationship Status", "picklist"),
  Country_of_Passport: contactField("Country_of_Passport", "Country of Passport", "text"),
  Passport_No: contactField("Passport_No", "Passport Number", "text"),
  Passport_Expiry_Date: contactField("Passport_Expiry_Date", "Passport Expiry Date", "date"),
  Country_of_Residence: contactField("Country_of_Residence", "Country of Residence", "text"),
  Current_Visa: contactField("Current_Visa", "Current Visa", "text"),
  Visa_Expiry_Date: contactField("Visa_Expiry_Date", "Current Visa Expiry Date", "date"),
  Secondary_Email: contactField("Secondary_Email", "Secondary Email", "text"),
  Phone: contactField("Phone", "Phone", "text"),
  Mobile: contactField("Mobile", "Mobile", "text"),
  Home_Phone: contactField("Home_Phone", "Home Phone", "text"),
  Mailing_Street: contactField("Mailing_Street", "Street", "text"),
  Mailing_Suburb: contactField("Mailing_Suburb", "Suburb", "text"),
  Mailing_City: contactField("Mailing_City", "Mailing City", "text"),
  Mailing_State: contactField("Mailing_State", "Mailing Province", "text"),
  Mailing_Country: contactField("Mailing_Country", "Mailing Country", "text"),
  Mailing_Zip: contactField("Mailing_Zip", "Post Code", "text"),
  Address_1_City: contactField("Address_1_City", "Address - City", "text"),
  Address_1_Country_Region: contactField("Address_1_Country_Region", "Address - Country / Region", "text"),
  Address_1_State_Province: contactField("Address_1_State_Province", "Address - State / Province", "text"),
  Address_1_Street_Address: contactField("Address_1_Street_Address", "Address - Street Address", "text"),
  Address_1_Zip_Postal_Code: contactField("Address_1_Zip_Postal_Code", "Address - Zip / Postal Code", "text"),
});

export const CRM_FIELD_CATALOG = Object.freeze({
  Contacts: CONTACTS_FIELDS,
  Partner_Dependents: Object.freeze({
    First_Name: field("First_Name", "First Name", "text"),
    Name: field("Name", "Family Name", "text"),
    Last_Name: field("Last_Name", "Last Name", "text"),
    Gender: field("Gender", "Gender", "picklist", { picklistValues: Object.freeze(["Male", "Female"]) }),
    Date_of_Birth: field("Date_of_Birth", "Date of Birth", "date"),
    Citizenship: field("Citizenship", "Citizenship", "text"),
    Email: field("Email", "Email", "text"),
    Relationship_to_Applicant: field("Relationship_to_Applicant", "Relationship to Applicant", "picklist", {
      picklistValues: Object.freeze(["Spouse", "Children", "Other"]),
    }),
    Is_Applicant: field("Is_Applicant", "Is Applicant", "boolean"),
    Non_Migrating: field("Non_Migrating", "Non Migrating", "boolean"),
  }),
  Deals: Object.freeze({
    Questionnaires_Status: field("Questionnaires_Status", "Questionnaires Status", "picklist", {
      picklistValues: Object.freeze(["Not Started", "In Progress", "Submitted"]),
    }),
  }),
});

export const SAFE_ZOHO_FIELD_API_NAME = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;

export function getCrmCatalogField(moduleName, fieldApiName) {
  const moduleFields = CRM_FIELD_CATALOG[moduleName];
  if (!moduleFields || typeof fieldApiName !== "string") return null;
  return moduleFields[fieldApiName] || null;
}

export function listCrmCatalogFields(moduleName) {
  if (moduleName) {
    const moduleFields = CRM_FIELD_CATALOG[moduleName];
    return moduleFields ? Object.values(moduleFields) : [];
  }
  return Object.entries(CRM_FIELD_CATALOG).flatMap(([module, fields]) =>
    Object.values(fields).map((item) => ({ ...item, module }))
  );
}

export function moduleForCrmTarget(target) {
  return CRM_TARGET_MODULES[target] || null;
}

export function serializeCrmFieldCatalog() {
  return {
    source: CRM_CATALOG_SOURCE,
    modules: Object.entries(CRM_FIELD_CATALOG).map(([apiName, fields]) => ({
      apiName,
      label: apiName.replace(/_/g, " "),
      fields: Object.values(fields).map((item) => ({
        apiName: item.apiName,
        label: item.label,
        type: item.type,
        picklistValues: item.picklistValues ? [...item.picklistValues] : [],
        source: item.source,
        requiresLiveVerification: item.requiresLiveVerification === true,
      })),
    })),
    targets: Object.entries(CRM_TARGET_MODULES).map(([target, module]) => ({ target, module })),
  };
}

export function compatibleTransformsFor(questionType, catalogFieldType) {
  const byQuestion = {
    text: [CRM_TRANSFORMS.text, CRM_TRANSFORMS.number, CRM_TRANSFORMS.picklist],
    textarea: [CRM_TRANSFORMS.multiline_text, CRM_TRANSFORMS.text],
    yesNo: [CRM_TRANSFORMS.boolean, CRM_TRANSFORMS.picklist],
    radio: [CRM_TRANSFORMS.picklist, CRM_TRANSFORMS.text],
    select: [CRM_TRANSFORMS.picklist, CRM_TRANSFORMS.text],
    checkbox: [CRM_TRANSFORMS.boolean],
    dateParts: [CRM_TRANSFORMS.date_parts_to_iso],
  };
  const byField = {
    text: [CRM_TRANSFORMS.text, CRM_TRANSFORMS.multiline_text],
    textarea: [CRM_TRANSFORMS.multiline_text, CRM_TRANSFORMS.text],
    date: [CRM_TRANSFORMS.date_parts_to_iso],
    picklist: [CRM_TRANSFORMS.picklist],
    boolean: [CRM_TRANSFORMS.boolean],
    number: [CRM_TRANSFORMS.number],
  };
  const questionTransforms = new Set(byQuestion[questionType] || []);
  const fieldTransforms = new Set(byField[catalogFieldType] || []);
  return [...questionTransforms].filter((transform) => fieldTransforms.has(transform));
}
