// Import Firebase via CDN (versi modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ⚠️ GANTI dengan config Firebase kamu
const firebaseConfig = {
  apiKey: "AIzaSyD1NREaJ7GV4v4W4tbLZa934HhQFSh1XGE",
  authDomain: "portal-44cf4.firebaseapp.com",
  projectId: "portal-44cf4",
  storageBucket: "portal-44cf4.firebasestorage.app",
  messagingSenderId: "878035990360",
  appId: "1:878035990360:web:f7dfa80437389b683ed72d",
  measurementId: "G-E69QYWQ8D7"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);