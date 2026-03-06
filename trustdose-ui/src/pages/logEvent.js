import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export async function logEvent(message, role = "system") {
  try {
    await addDoc(collection(db, "logs"), {
      message: message,
      role: role,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error writing log:", error);
  }
}