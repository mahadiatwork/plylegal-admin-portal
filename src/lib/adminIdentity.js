import { adminAuth, initResult } from "./firebase-admin";
import { ADMIN_ROLES, adminRoleLabel, isAdminRole } from "./adminRoles";

const IDENTITY_TOOLKIT_BASE_URL = "https://identitytoolkit.googleapis.com/v1/accounts";

export class AdminIdentityError extends Error {
  constructor(message, status = 400, code = "ADMIN_IDENTITY_ERROR") {
    super(message);
    this.name = "AdminIdentityError";
    this.status = status;
    this.code = code;
  }
}

function requireFirebaseAdmin() {
  if (!adminAuth) {
    throw new AdminIdentityError(
      "Staff accounts are unavailable because Firebase Admin is not configured.",
      503,
      "FIREBASE_ADMIN_UNAVAILABLE"
    );
  }
  return adminAuth;
}

function requireFirebaseApiKey() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) {
    throw new AdminIdentityError(
      "Staff sign-in is unavailable because Firebase Authentication is not configured.",
      503,
      "FIREBASE_AUTH_UNAVAILABLE"
    );
  }
  return apiKey;
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AdminIdentityError("Enter a valid email address.", 400, "INVALID_EMAIL");
  }
  return email;
}

function validateName(value) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 120) {
    throw new AdminIdentityError("Name must be between 2 and 120 characters.", 400, "INVALID_NAME");
  }
  return name;
}

function validatePassword(value, label = "Password") {
  const password = typeof value === "string" ? value : "";
  if (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new AdminIdentityError(
      `${label} must be 8–128 characters and include at least one letter and one number.`,
      400,
      "INVALID_PASSWORD"
    );
  }
  return password;
}

function validateRole(value) {
  if (!isAdminRole(value)) {
    throw new AdminIdentityError("Choose a valid role.", 400, "INVALID_ROLE");
  }
  return value;
}

async function firebasePasswordSignIn(email, password) {
  const apiKey = requireFirebaseApiKey();
  let response;
  try {
    response = await fetch(`${IDENTITY_TOOLKIT_BASE_URL}:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      cache: "no-store",
    });
  } catch {
    throw new AdminIdentityError("Unable to reach the sign-in service.", 503, "AUTH_SERVICE_UNAVAILABLE");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.localId) {
    throw new AdminIdentityError("The email or password is incorrect.", 401, "INVALID_CREDENTIALS");
  }
  return data;
}

function portalIdentityFromUser(userRecord) {
  const role = userRecord.customClaims?.portalRole;
  if (!isAdminRole(role)) {
    throw new AdminIdentityError("This account does not have admin portal access.", 403, "PORTAL_ACCESS_REQUIRED");
  }
  if (userRecord.disabled) {
    throw new AdminIdentityError("This account has been disabled.", 403, "ACCOUNT_DISABLED");
  }
  return {
    uid: userRecord.uid,
    name: userRecord.displayName?.trim() || userRecord.email?.split("@", 1)[0] || "Staff member",
    email: normalizeEmail(userRecord.email),
    role,
    provider: "firebase",
    mustChangePassword: userRecord.customClaims?.mustChangePassword === true,
  };
}

function publicUser(userRecord) {
  const identity = portalIdentityFromUser(userRecord);
  return {
    uid: identity.uid,
    name: identity.name,
    email: identity.email,
    role: identity.role,
    roleLabel: adminRoleLabel(identity.role),
    mustChangePassword: identity.mustChangePassword,
    createdAt: userRecord.metadata?.creationTime || null,
  };
}

export async function authenticateAdminIdentity(emailInput, password) {
  const email = validateEmail(emailInput);
  const signIn = await firebasePasswordSignIn(email, password);
  const userRecord = await requireFirebaseAdmin().getUser(signIn.localId);
  return portalIdentityFromUser(userRecord);
}

export async function listPortalUsers() {
  const auth = requireFirebaseAdmin();
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const userRecord of page.users) {
      if (isAdminRole(userRecord.customClaims?.portalRole)) users.push(publicUser(userRecord));
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return users.sort((left, right) => left.name.localeCompare(right.name));
}

export async function createPortalUser(input) {
  const auth = requireFirebaseAdmin();
  const name = validateName(input?.name);
  const email = validateEmail(input?.email);
  const role = validateRole(input?.role);
  const temporaryPassword = validatePassword(input?.temporaryPassword, "Temporary password");
  let userRecord;
  try {
    userRecord = await auth.createUser({ email, displayName: name, password: temporaryPassword });
    await auth.setCustomUserClaims(userRecord.uid, {
      ...(userRecord.customClaims || {}),
      portalRole: role,
      mustChangePassword: true,
    });
    return publicUser(await auth.getUser(userRecord.uid));
  } catch (error) {
    if (userRecord?.uid) await auth.deleteUser(userRecord.uid).catch(() => {});
    if (error?.code === "auth/email-already-exists") {
      throw new AdminIdentityError("A user with this email already exists.", 409, "EMAIL_EXISTS");
    }
    if (error instanceof AdminIdentityError) throw error;
    console.error("Error creating admin portal user:", error);
    throw new AdminIdentityError("Unable to create the user.", 500, "CREATE_USER_FAILED");
  }
}

export async function resetPortalUserPassword(uid, temporaryPassword) {
  const auth = requireFirebaseAdmin();
  const normalizedUid = typeof uid === "string" ? uid.trim() : "";
  if (!normalizedUid || normalizedUid.length > 128) {
    throw new AdminIdentityError("User is invalid.", 400, "INVALID_USER");
  }
  const password = validatePassword(temporaryPassword, "Temporary password");
  try {
    const userRecord = await auth.getUser(normalizedUid);
    const identity = portalIdentityFromUser(userRecord);
    await auth.updateUser(normalizedUid, { password });
    await auth.setCustomUserClaims(normalizedUid, {
      ...(userRecord.customClaims || {}),
      portalRole: identity.role,
      mustChangePassword: true,
    });
    await auth.revokeRefreshTokens(normalizedUid);
    return publicUser(await auth.getUser(normalizedUid));
  } catch (error) {
    if (error instanceof AdminIdentityError) throw error;
    if (error?.code === "auth/user-not-found") {
      throw new AdminIdentityError("User was not found.", 404, "USER_NOT_FOUND");
    }
    console.error("Error resetting admin portal password:", error);
    throw new AdminIdentityError("Unable to reset the password.", 500, "RESET_PASSWORD_FAILED");
  }
}

export async function changeOwnPortalPassword(session, currentPassword, newPassword) {
  if (!session?.email) throw new AdminIdentityError("Account email is unavailable.", 400, "EMAIL_REQUIRED");
  const password = validatePassword(newPassword, "New password");
  if (currentPassword === password) {
    throw new AdminIdentityError("Choose a new password that is different from the current password.", 400, "PASSWORD_UNCHANGED");
  }
  const signIn = await firebasePasswordSignIn(session.email, currentPassword);
  if (signIn.localId !== session.sub) {
    throw new AdminIdentityError("The current password is incorrect.", 401, "INVALID_CREDENTIALS");
  }
  const auth = requireFirebaseAdmin();
  const userRecord = await auth.getUser(session.sub);
  const identity = portalIdentityFromUser(userRecord);
  await auth.updateUser(session.sub, { password });
  await auth.setCustomUserClaims(session.sub, {
    ...(userRecord.customClaims || {}),
    portalRole: identity.role,
    mustChangePassword: false,
  });
  await auth.revokeRefreshTokens(session.sub);
  return { ...identity, mustChangePassword: false };
}

export function firebaseAdminStatus() {
  return { available: Boolean(adminAuth), error: initResult?.error || null };
}

export { ADMIN_ROLES };
