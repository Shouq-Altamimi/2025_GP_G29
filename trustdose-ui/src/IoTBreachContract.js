import { ethers } from "ethers";
import IoTBreachRecorder from "../src/IoTBreachRecorder.json";

export const BREACH_CONTRACT_ADDRESS = "0x3D979d3f12634452585550C419d64Cf4D83EeF60";

export async function getBreachContract() {
  if (!window.ethereum) {
    throw new Error("MetaMask not detected");
  }

  await window.ethereum.request({ method: "eth_requestAccounts" });

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  return new ethers.Contract(
    BREACH_CONTRACT_ADDRESS,
    IoTBreachRecorder.abi,
    signer
  );
}

export async function recordBreachOnChain({
  prescriptionOnchainId,
  breachType,
  measuredValue,
  minAllowed,
  maxAllowed,
  breachTime,
}) {
  const contract = await getBreachContract();

  const tx = await contract.recordBreach(
    Number(prescriptionOnchainId),
    breachType,
    Number(measuredValue),
    Number(minAllowed),
    Number(maxAllowed),
    Number(breachTime)
  );

  const receipt = await tx.wait();
  return receipt?.hash || tx.hash;
}