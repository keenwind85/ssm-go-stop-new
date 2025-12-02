import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Firebase configuration
// TODO: Replace with your Firebase project config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyA6SGe-2vpVd-9HFxpdBKRcDUmRxzaNe6I',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'go-stop-new.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'go-stop-new',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'go-stop-new.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '384844904042',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:384844904042:web:de9e5390ffd55ddb693c13',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://go-stop-new-default-rtdb.asia-southeast1.firebasedatabase.app/',
};

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let database: Database;
let firestore: Firestore;

export function initializeFirebase(): {
  app: FirebaseApp;
  auth: Auth;
  database: Database;
  firestore: Firestore;
} {
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    database = getDatabase(app);
    firestore = getFirestore(app);
  }

  return { app, auth, database, firestore };
}

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    if (!app) {
      app = initializeApp(firebaseConfig);
    }
    auth = getAuth(app);
  }
  return auth;
}

export function getRealtimeDatabase(): Database {
  if (!database) {
    if (!app) {
      app = initializeApp(firebaseConfig);
    }
    database = getDatabase(app);
  }
  return database;
}

export function getFirestoreDatabase(): Firestore {
  if (!firestore) {
    if (!app) {
      app = initializeApp(firebaseConfig);
    }
    firestore = getFirestore(app);
  }
  return firestore;
}
