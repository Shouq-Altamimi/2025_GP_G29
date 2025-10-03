import { db } from "./firebase.js";
import { doc, getDoc } from "firebase/firestore";

async function run() {
  const snap = await getDoc(doc(db, "patients", "Ph_1"));
  if (!snap.exists()) return console.log("No doc found!");

  const data = snap.data();

  // تحويل الـ Timestamp إلى تاريخ بصيغة واضحة
  let birthdateText = "غير معروف";
  if (data.birthdate && data.birthdate.toDate) {
    const dateObj = data.birthdate.toDate();
    // نخليها تطلع مثل: 4 July 1995
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    birthdateText = dateObj.toLocaleDateString('en-GB', options);
  }

  console.log({
    ...data,
    birthdate: birthdateText
  });
}

run();