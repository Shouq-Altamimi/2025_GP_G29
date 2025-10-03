import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD2m8eKUYpYCS17AoipbsbrQrZkK1mwtNM",
  authDomain: "trustdose-96656.firebaseapp.com",
  projectId: "trustdose-96656",
  storageBucket: "trustdose-96656.firebasestorage.app",
  messagingSenderId: "985521835267",
  appId: "1:985521835267:web:221137ec5d8ff78348ed36",
  measurementId: "G-K0EWZKBDT2"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app); // <-- مهم
