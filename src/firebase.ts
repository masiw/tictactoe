import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

export const firebaseConfigured = Boolean(
  config.apiKey && config.databaseURL && config.projectId,
);

let app: FirebaseApp | null = null;
let db: Database | null = null;

export function getDb(): Database {
  if (!firebaseConfigured) {
    throw new Error(
      'Firebase env vars are missing. Set VITE_FIREBASE_API_KEY, ' +
        'VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_DATABASE_URL, and ' +
        'VITE_FIREBASE_PROJECT_ID. See SETUP.md.',
    );
  }
  if (!app) app = initializeApp(config);
  if (!db) db = getDatabase(app);
  return db;
}
