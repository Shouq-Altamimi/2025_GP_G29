import { ethers } from "ethers";
import AccessControl from "../contracts/AccessControl.json"; // تأكد من المسار الصحيح

const ROLE_DOCTOR = 2; // مطابق لـ enum Role في العقد

async function saveDoctorOnChain({ contractAddress, doctorWallet, accessId }) {
  if (!window.ethereum) throw new Error("MetaMask not found");

  // طلب الإذن من ميتاماسك
  await window.ethereum.request({ method: "eth_requestAccounts" });

  // تهيئة المزود والموقّع
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  // تحميل العقد
  const contract = new ethers.Contract(contractAddress, AccessControl.abi, signer);

  // استدعاء الدالة addUser
  const tx = await contract.addUser(doctorWallet, ROLE_DOCTOR, accessId);
  const receipt = await tx.wait();

  return { txHash: tx.hash, block: receipt.blockNumber };
}
