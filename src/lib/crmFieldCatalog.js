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

export const CRM_FIELD_CATALOG = Object.freeze({
  Contacts: Object.freeze({
    First_Name: field("First_Name", "First Name", "text"),
    Last_Name: field("Last_Name", "Last Name", "text"),
    Gender: field("Gender", "Gender", "picklist", { picklistValues: Object.freeze(["Male", "Female"]) }),
    Date_of_Birth: field("Date_of_Birth", "Date of Birth", "date"),
    Email: field("Email", "Email", "text"),
  }),
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
