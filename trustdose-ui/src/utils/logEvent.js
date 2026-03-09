import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export async function logEvent(message, role = "system", action = "general") {
  try {
    console.log("logEvent called:", { message, role, action });

    const ref = await addDoc(collection(db, "logs"), {
      message,
      role,
      action,
      createdAt: serverTimestamp(),
    });

    console.log("Log written successfully:", ref.id);
  } catch (error) {
    console.error("Error writing log:", error);
  }
}