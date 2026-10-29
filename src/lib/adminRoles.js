export const ADMIN_ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  SALES_SUPPORT: "sales_support",
});

export const ADMIN_ROLE_OPTIONS = Object.freeze([
  { value: ADMIN_ROLES.ADMIN, label: "Admin" },
  { value: ADMIN_ROLES.SUPER_ADMIN, label: "Super admin" },
  { value: ADMIN_ROLES.SALES_SUPPORT, label: "Sales / support" },
]);

const ADMIN_ROLE_VALUES = new Set(ADMIN_ROLE_OPTIONS.map(({ value }) => value));

export function isAdminRole(value) {
  return ADMIN_ROLE_VALUES.has(value);
}

export function adminRoleLabel(value) {
  return ADMIN_ROLE_OPTIONS.find((option) => option.value === value)?.label || "Staff";
}

export function canAccessQuestionnaireBuilder(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN;
}

export function canManageAdminUsers(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN;
}
