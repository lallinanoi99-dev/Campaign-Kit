// ===== Campaign Kit config — the only place to change addresses and endpoints =====
export const CONFIG = {
  // "mainnet" for the live site, "testnet" while testing
  NETWORK: "mainnet",

  // Paste the deployed CampaignKitPlans address here. Zero address = "not deployed yet" mode
  // (building, editing and exports still work; stamping is disabled).
  MAINNET_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000",
  TESTNET_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000",

  // Your Cloudflare Worker with /kit/plan, /kit/rewrite and /extract-url.
  // Leave empty to run in template mode (no AI — the kit is built from the brief in the browser).
  WORKER_URL: "",

  // The "Trusted by N campaigns" line on the home page only shows from this many stamped plans.
  MIN_COUNT_TO_SHOW: 10,

  GITHUB_URL: "https://github.com/",
  X_URL: "https://x.com/BOTChain_ai",
  INSTAGRAM_URL: "https://instagram.com/",
  LINKEDIN_URL: "https://linkedin.com/",

  NETWORKS: {
    mainnet: {
      chainId: 677,
      chainName: "BOT Chain",
      rpc: "https://rpc.botchain.ai",
      explorer: "https://scan.botchain.ai",
      currency: { name: "BOT", symbol: "BOT", decimals: 18 },
    },
    testnet: {
      chainId: 968,
      chainName: "BOT Chain Testnet",
      rpc: "https://rpc.bohr.life",
      explorer: "https://scan.bohr.life",
      currency: { name: "BOT", symbol: "BOT", decimals: 18 },
    },
  },
};

export const NET = CONFIG.NETWORKS[CONFIG.NETWORK];
export const CONTRACT = CONFIG.NETWORK === "mainnet" ? CONFIG.MAINNET_CONTRACT_ADDRESS : CONFIG.TESTNET_CONTRACT_ADDRESS;
export const IS_DEPLOYED = !/^0x0{40}$/i.test(CONTRACT);

export const GOALS = ["Launch", "Signups", "Sales", "Awareness", "Event attendance"];

export const ABI = [
  "function stampPlan(bytes32 planHash, string title, uint8 goal, uint64 launchDate, uint8 milestones) returns (uint256 id)",
  "function tick(uint256 id, uint8 index)",
  "function updateHash(uint256 id, bytes32 newHash)",
  "function getPlan(uint256 id) view returns (tuple(address owner, bytes32 planHash, string title, uint8 goal, uint64 launchDate, uint8 milestones, uint8 done, uint64 at))",
  "function plansOfOwner(address owner) view returns (uint256[])",
  "function progress(uint256 id) view returns (uint8 done, uint8 total, uint32 mask)",
  "function stats() view returns (uint256 planCount, uint256 ticked)",
  "function milestoneDone(uint256 id, uint8 index) view returns (bool)",
  "event PlanStamped(uint256 indexed id, address indexed owner, uint8 goal)",
  "event MilestoneDone(uint256 indexed id, uint8 index, uint8 done)",
  "event PlanUpdated(uint256 indexed id, bytes32 planHash)",
  "error EmptyHash()",
  "error BadTitle()",
  "error BadGoal()",
  "error BadLaunchDate()",
  "error BadMilestones()",
  "error NotFound()",
  "error NotOwner()",
  "error BadIndex()",
  "error AlreadyDone()",
];
