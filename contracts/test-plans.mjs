// Local test for CampaignKitPlans: node contracts/test-plans.mjs contracts/CampaignKitPlans.sol assets/config.js
// Needs (in any folder on NODE_PATH or next to this file): npm i solc@0.8.24 ganache@7.9.2 ethers@6.13.4
import fs from "node:fs";
import solc from "solc";
import ganache from "ganache";
import { ethers } from "ethers";

const src = fs.readFileSync(process.argv[2], "utf8");
const cfg = fs.readFileSync(process.argv[3], "utf8");
const ABI = eval("[" + cfg.split("export const ABI = [")[1].split("];")[0] + "]"); // the front-end ABI
const out = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "P.sol": { content: src } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
})));
(out.errors || []).forEach((e) => console.log(e.severity, e.formattedMessage.split("\n")[0]));
if ((out.errors || []).some((e) => e.severity === "error")) process.exit(1);
const art = out.contracts["P.sol"].CampaignKitPlans;

const provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true }, chain: { hardfork: "shanghai" } }));
const [a, b] = await Promise.all([provider.getSigner(0), provider.getSigner(1)]);
const dep = await new ethers.ContractFactory(art.abi, art.evm.bytecode.object, a).deploy();
await dep.waitForDeployment();
const c = new ethers.Contract(await dep.getAddress(), ABI, a);
const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) process.exitCode = 1; };
const expectRevert = async (p, name, msg) => {
  try { await p; ok(false, msg); } catch (e) {
    const n = e.revert?.name || (e.data && c.interface.parseError(e.data)?.name) || e.shortMessage;
    ok(String(n).includes(name), `${msg} (${n})`);
  }
};
const LAUNCH = 1793750400n; // 2026-11-04 UTC

let [plans, ticked] = await c.stats();
ok(plans === 0n && ticked === 0n, "stats start at 0");

const rc = await (await c.stampPlan(h("plan1"), "Brewly launch", 0, LAUNCH, 5)).wait();
const ev = rc.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).find((x) => x?.name === "PlanStamped");
ok(ev && ev.args.id === 0n && Number(ev.args.goal) === 0, "first plan gets id 0 and emits PlanStamped");
await (await c.connect(b).stampPlan(h("plan2"), "StudyBuddy", 1, LAUNCH, 30)).wait();

const p = await c.getPlan(0n);
ok(p.owner === (await a.getAddress()) && p.title === "Brewly launch" && p.planHash === h("plan1") && p.launchDate === LAUNCH && Number(p.milestones) === 5 && Number(p.done) === 0 && p[7] > 0n, "getPlan returns the full struct");
ok((await c.plansOfOwner(await b.getAddress())).map(Number).join() === "1", "plansOfOwner");

await expectRevert(c.stampPlan.staticCall(ethers.ZeroHash, "x", 0, LAUNCH, 3), "EmptyHash", "zero hash rejected");
await expectRevert(c.stampPlan.staticCall(h("t"), "", 0, LAUNCH, 3), "BadTitle", "empty title rejected");
await expectRevert(c.stampPlan.staticCall(h("t"), "x".repeat(49), 0, LAUNCH, 3), "BadTitle", "title > 48 bytes rejected");
ok((await c.stampPlan.staticCall(h("t"), "x".repeat(48), 0, LAUNCH, 3)) === 2n, "title of exactly 48 bytes accepted");
await expectRevert(c.stampPlan.staticCall(h("t"), "ok", 5, LAUNCH, 3), "BadGoal", "goal 5 rejected");
await expectRevert(c.stampPlan.staticCall(h("t"), "ok", 0, 0, 3), "BadLaunchDate", "launch date 0 rejected");
await expectRevert(c.stampPlan.staticCall(h("t"), "ok", 0, LAUNCH, 0), "BadMilestones", "0 milestones rejected");
await expectRevert(c.stampPlan.staticCall(h("t"), "ok", 0, LAUNCH, 31), "BadMilestones", "31 milestones rejected");

const rt = await (await c.tick(0n, 2)).wait();
const tev = rt.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).find((x) => x?.name === "MilestoneDone");
ok(tev && Number(tev.args.index) === 2 && Number(tev.args.done) === 1, "tick emits MilestoneDone(id, index, done)");
await (await c.tick(0n, 0)).wait();
const pr = await c.progress(0n);
ok(Number(pr.done) === 2 && Number(pr.total) === 5 && Number(pr.mask) === 0b101, "progress returns done, total and mask");
ok(await c.milestoneDone(0n, 2), "milestoneDone mapping");
await expectRevert(c.tick.staticCall(0n, 2), "AlreadyDone", "same milestone cannot be ticked twice");
await expectRevert(c.tick.staticCall(0n, 5), "BadIndex", "index past milestones rejected");
await expectRevert(c.connect(b).tick.staticCall(0n, 1), "NotOwner", "only the owner can tick");
await expectRevert(c.tick.staticCall(9n, 0), "NotFound", "unknown plan NotFound");

await (await c.connect(b).tick(1n, 29)).wait();
ok(Number((await c.progress(1n)).mask) === 2 ** 29, "milestone 29 sets the top bit");

await expectRevert(c.connect(b).updateHash.staticCall(0n, h("x")), "NotOwner", "only the owner can update the hash");
await expectRevert(c.updateHash.staticCall(0n, ethers.ZeroHash), "EmptyHash", "zero new hash rejected");
await (await c.updateHash(0n, h("plan1-edited"))).wait();
ok((await c.getPlan(0n)).planHash === h("plan1-edited"), "updateHash stores the new fingerprint");

[plans, ticked] = await c.stats();
ok(plans === 2n && ticked === 3n, "stats counts plans and ticked milestones");
await expectRevert(c.getPlan(2n), "NotFound", "getPlan past the end NotFound");
console.log("bytecode bytes:", art.evm.bytecode.object.length / 2);
