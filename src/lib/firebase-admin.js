/**
 * Firebase Admin SDK Configuration
 * 
 * Server-side Firebase initialization for admin operations like:
 * - Creating users with custom passwords
 * - Managing user accounts
 * - Server-side Firestore operations
 */

import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function loadServiceAccountFromFile() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.join(process.cwd(), 'service.json'),
    path.join(process.cwd(), 'service-account.json'),
  ].filter(Boolean);

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        console.log(`✅ Loaded service account from file: ${filePath}`);
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to read service account at ${filePath}:`, err.message);
    }
  }
  return null;
}

let adminApp = null;
let adminAuth = null;
let db = null;
let isInitialized = false;
let initError = null;

function initializeAdminSDK() {
  if (isInitialized) return { success: !!db, error: initError };
  
  isInitialized = true;
  
  try {
    // Check if already initialized
    if (!admin.apps.length) {
      console.log('🔧 Initializing Firebase Admin SDK...');
      
      let projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      
      // Try to use service account JSON if available
      let serviceAccount = null;
      const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      
      if (serviceAccountKey) {
        try {
          // Remove surrounding single quotes if they exist
          let cleanKey = serviceAccountKey.trim();
          if (cleanKey.startsWith("'") && cleanKey.endsWith("'")) {
            cleanKey = cleanKey.slice(1, -1);
          }
          serviceAccount = JSON.parse(cleanKey);
          
          if (!projectId && serviceAccount.project_id) {
            projectId = serviceAccount.project_id;
          }

          console.log(`✅ Loaded credentials for: ${serviceAccount.client_email}`);
          console.log(`✅ Target Project ID: ${projectId}`);

          // Ensure private_key has correct newlines
          if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
          }
        } catch (parseError) {
          console.warn('⚠️ Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', parseError.message);
        }
      }

      // Fallback: load service account JSON from a file on disk
      if (!serviceAccount) {
        const fileAccount = loadServiceAccountFromFile();
        if (fileAccount) {
          serviceAccount = fileAccount;
          if (!projectId && serviceAccount.project_id) {
            projectId = serviceAccount.project_id;
          }
          if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
          }
          console.log(`✅ Loaded credentials for: ${serviceAccount.client_email}`);
          console.log(`✅ Target Project ID: ${projectId}`);
        }
      }

      if (!projectId) {
        throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID or project_id in service account is required for Admin SDK');
      }
      
      // Initialize with service account credentials (REQUIRED for Firestore operations)
      if (serviceAccount) {
        adminApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log('✅ Firebase Admin SDK initialized');
        
        // Get services only if we have proper credentials
        adminAuth = getAuth(adminApp);
        db = getFirestore(adminApp);
      } else {
        console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY is required for server-side Firestore operations');
        console.error('💡 To get a service account key:');
        console.error('   1. Go to Firebase Console → Project Settings → Service Accounts');
        console.error('   2. Click "Generate New Private Key"');
        console.error('   3. Add the JSON content to your .env file as FIREBASE_SERVICE_ACCOUNT_KEY');
        initError = 'Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable';
        return { success: false, error: initError };
      }
    } else {
      adminApp = admin.app();
      adminAuth = getAuth(adminApp);
      db = getFirestore(adminApp);
      console.log('✅ Using existing Firebase Admin app');
    }
    
    return { success: true, error: null };
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    initError = error.message;
    return { success: false, error: error.message };
  }
}

// Initialize on module load
const initResult = initializeAdminSDK();

export { adminApp, adminAuth, db, initResult };
export default admin;
