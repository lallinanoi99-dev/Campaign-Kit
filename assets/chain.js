// Wallet + contract helpers (ethers v6 UMD is loaded as window.ethers).
import { CONFIG, NET, CONTRACT, IS_DEPLOYED, ABI } from "./config.js";

const HEX_CHAIN = "0x" + NET.chainId.toString(16);
export const wallet = { address: null, chainOk: false };
const listeners = new Set();
export const onWallet = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn(wallet));

export const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
export const explorerAddr = (a) => `${NET.explorer}/address/${a}`;
export const explorerTx = (h) => `${NET.explorer}/tx/${h}`;
export const hasMetaMask = () => !!window.ethereum;

async function waitEthers() {
  for (let i = 0; i < 100 && !window.ethers; i++) await new Promise((r) => setTimeout(r, 50));
  if (!window.ethers) throw new Error("ethers_missing");
  return window.ethers;
}

let readC = null;
export async function readContract() {
  if (!IS_DEPLOYED) return null;
  if (readC) return readC;
  const ethers = await waitEthers();
  const provider = new ethers.JsonRpcProvider(NET.rpc, NET.chainId, { staticNetwork: true });
  readC = new ethers.Contract(CONTRACT, ABI, provider);
  return readC;
}

export async function rpcBlockNumber() {
  const r = await fetch(NET.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
    signal: AbortSignal.timeout(6000),
  });
  const j = await r.json();
  return parseInt(j.result, 16);
}

export async function ensureChain() {
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: HEX_CHAIN }] });
  } catch (e) {
    if (e.code === 4902 || e?.data?.originalError?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: HEX_CHAIN, chainName: NET.chainName, rpcUrls: [NET.rpc], blockExplorerUrls: [NET.explorer], nativeCurrency: NET.currency }],
      });
    } else throw e;
  }
  await refreshWallet();
  return wallet.chainOk;
}

export async function connect() {
  if (!hasMetaMask()) { window.open("https://metamask.io/download/", "_blank", "noopener"); return false; }
  const [addr] = await window.ethereum.request({ method: "eth_requestAccounts" });
  wallet.address = addr || null;
  emit();
  await ensureChain();
  return !!wallet.address && wallet.chainOk;
}

export async function refreshWallet() {
  if (!hasMetaMask()) return emit();
  try {
    const [addr] = await window.ethereum.request({ method: "eth_accounts" });
    const id = await window.ethereum.request({ method: "eth_chainId" });
    wallet.address = addr || null;
    wallet.chainOk = parseInt(id, 16) === NET.chainId;
  } catch { /* ignore */ }
  emit();
}

export function initWallet() {
  if (hasMetaMask()) {
    window.ethereum.on?.("accountsChanged", refreshWallet);
    window.ethereum.on?.("chainChanged", refreshWallet);
  }
  refreshWallet();
}

// One click: connect if needed, switch chain if needed. Returns a signer-backed contract.
export async function writeContract() {
  if (!IS_DEPLOYED) throw new Error("not_deployed");
  if (!hasMetaMask()) throw new Error("no_metamask");
  if (!wallet.address) await connect();
  if (!wallet.chainOk) await ensureChain();
  if (!wallet.address || !wallet.chainOk) throw new Error("wrong_network");
  const ethers = await waitEthers();
  const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
  return new ethers.Contract(CONTRACT, ABI, signer);
}

export function txError(e) {
  const code = e?.code ?? e?.info?.error?.code;
  if (code === "ACTION_REJECTED" || code === 4001) return "You rejected the transaction in MetaMask.";
  const name = e?.revert?.name;
  const map = {
    BadTitle: "The campaign name must be 1–48 bytes.", BadMilestones: "A plan needs 1–30 milestones.", NotOwner: "Only the wallet that stamped this plan can do that.",
    AlreadyDone: "That milestone is already ticked.", NotFound: "Campaign not found on-chain.", BadGoal: "Unknown goal.", BadLaunchDate: "Pick a launch date.", EmptyHash: "Missing fingerprint.",
  };
  if (name && map[name]) return map[name];
  if (e?.message === "no_metamask") return "Install MetaMask to stamp your plan.";
  if (e?.message === "wrong_network") return "Switch MetaMask to BOT Chain to continue.";
  if (e?.message === "not_deployed") return "The Campaign Kit contract isn't deployed yet.";
  if (/insufficient funds/i.test(e?.message || "")) return "Not enough BOT for the network fee.";
  return "The transaction failed. Please try again.";
}

export async function keccakText(text) {
  const ethers = await waitEthers();
  return ethers.keccak256(ethers.toUtf8Bytes(text));
}
export { CONFIG, NET, CONTRACT, IS_DEPLOYED };
