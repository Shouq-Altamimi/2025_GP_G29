// src/web3.js
import { ethers } from "ethers";
import AccessControlArtifact from "./contracts/AccessControl.json";

// ✨ ضعي هنا عنوان العقد من Ganache (Contracts tab)
export const ACCESS_CONTROL_ADDRESS = "0xbac0f8437B6aD3564015e6e20CD67cFA3dbCEBf5";

export async function getProviderAndSigner() {
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed.");
  }
  // طلب الاتصال من MetaMask
  await window.ethereum.request({ method: "eth_requestAccounts" });

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return { provider, signer };
}

export async function getAccessControlContract(signerOrProvider) {
  return new ethers.Contract(
    ACCESS_CONTROL_ADDRESS,
    AccessControlArtifact.abi,
    signerOrProvider
  );
}
