// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FB_API_KEY,
  authDomain: process.env.REACT_APP_FB_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FB_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FB_SENDER,
  appId: process.env.REACT_APP_FB_APP_ID,
  // measurementId: process.env.REACT_APP_FB_MEASUREMENT_ID, // اختياري
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export default app;
