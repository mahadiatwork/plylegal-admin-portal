import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const requireFromNext = createRequire(require.resolve("next/package.json"));
const { loadEnvConfig } = requireFromNext("@next/env");

loadEnvConfig(process.cwd());

const email = process.argv[2]?.trim().toLowerCase();

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: npm run admin:grant-super -- user@example.com");
  process.exit(1);
}

const { adminAuth, initResult } = await import("../src/lib/firebase-admin.js");
if (!adminAuth) {
  console.error(initResult?.error || "Firebase Admin is not configured.");
  process.exit(1);
}

try {
  const user = await adminAuth.getUserByEmail(email);
  await adminAuth.setCustomUserClaims(user.uid, {
    ...(user.customClaims || {}),
    portalRole: "super_admin",
    mustChangePassword: false,
  });
  console.log(`Granted super-admin portal access to ${email}.`);
} catch (error) {
  if (error?.code === "auth/user-not-found") {
    console.error("Create this email in Firebase Authentication first, then run the command again.");
  } else {
    console.error(error?.message || "Unable to grant super-admin access.");
  }
  process.exit(1);
}
