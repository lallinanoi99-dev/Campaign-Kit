// node scripts/test-kit.mjs — checks for assets/kit.js (validation, caps, exports)
import * as K from "../assets/kit.js";
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const brief = { name: "Brewly", what: "Coffee subscription", audience: "busy professionals who love coffee", goal: "Signups", channels: ["X", "Instagram", "Email"], budget: "Small", tone: "Friendly", launchDate: "2026-11-10", facts: ["First bag ships within 48 hours"] };

const t = K.normalizeKit(K.templateKit(brief), brief);
ok(t.missing.length === 0, "template kit is complete (" + t.missing.join(",") + ")");
ok(K.heroMissing(t.kit, brief.channels).length === 0, "template has a launch-day hero post on every channel");
ok(t.kit.calendar.every((p) => brief.channels.includes(p.channel) && p.day >= -7 && p.day <= 7), "posts only on selected channels, days -7..7");
ok(t.kit.calendar.filter((p) => p.channel === "X").every((p) => [...p.text].length + 1 + p.hashtags.join(" ").length <= 280), "template X posts fit 280");

const bad = K.normalizeKit({ positioning: { oneLiner: "x" }, calendar: [{ day: 3, channel: "twitter", text: "hi", time: "25:00" }, { day: 9, channel: "X", text: "out of range" }, { day: 1, channel: "TikTok", text: "not selected" }] }, brief);
ok(["positioning", "personas", "calendar", "ads", "hashtags", "checklist"].every((p) => bad.missing.includes(p)), "missing parts are listed");
ok(bad.kit.calendar.length === 1 && bad.kit.calendar[0].channel === "X" && bad.kit.calendar[0].time === "09:00", "twitter→X, bad time → default, out-of-range and unselected dropped");

const many = Array.from({ length: 7 }, (_, i) => ({ day: -7 + i, channel: "LinkedIn", text: "p" + i }));
many.push({ day: 0, channel: "LinkedIn", text: "hero" }, { day: 0, channel: "LinkedIn", text: "dup hero" });
const capped = K.normalizeKit({ calendar: many }, { channels: ["LinkedIn"] }).kit.calendar;
ok(capped.filter((p) => p.day < 0).length === 3, "LinkedIn capped at 3/week before launch");
ok(capped.filter((p) => p.day === 0).length === 1, "one post per channel per day (hero kept)");

const cl = { before: Array.from({ length: 12 }, (_, i) => ({ text: "b" + i })), launch: Array.from({ length: 12 }, () => ({ text: "l" })), after: Array.from({ length: 12 }, () => ({ text: "a" })) };
K.trimChecklist(cl);
ok(K.milestoneList(cl).length === 30, "checklist trimmed to 30 milestones");

ok(K.briefProblems({ ...brief, launchDate: "2020-01-01" }).launchDate === "Pick a future date (or today)", "past launch date rejected");
ok(Object.keys(K.briefProblems(brief, "2026-11-01")).length === 0, "valid brief has no problems");
ok(K.briefProblems({ ...brief, website: "not a url" }, "2026-11-01").website, "bad website flagged");

ok(new TextEncoder().encode(K.clipBytes("☕".repeat(30))).length <= 48, "clipBytes keeps titles ≤ 48 bytes");
ok(K.launchUnix("2026-11-04") === 1793750400, "launchUnix = UTC midnight");

const c = { brief, kit: t.kit };
const csv = K.toCSV(c);
ok(csv.startsWith("﻿date,time,channel") && csv.split("\r\n").length - 2 === t.kit.calendar.length, "CSV has header + one row per post");
const c2 = { brief, kit: { ...t.kit, calendar: [{ ...t.kit.calendar[0], text: '=HYPERLINK("x"), "quoted"\nline' }] } };
ok(K.toCSV(c2).includes(`"'=HYPERLINK(""x""), ""quoted""\nline"`), "CSV escapes quotes/newlines and blocks formulas");
const ics = K.toICS(c);
ok((ics.match(/BEGIN:VEVENT/g) || []).length === t.kit.calendar.length && ics.includes("BEGIN:VCALENDAR") && ics.endsWith("END:VCALENDAR\r\n"), "ICS has one VEVENT per post");
ok(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75), "ICS lines folded to ≤ 75 octets");
ok(K.canonicalPlan(c) === K.canonicalPlan({ brief, kit: { ...t.kit, calendar: [...t.kit.calendar].reverse() } }), "fingerprint ignores post order");
ok(K.canonicalPlan(c) !== K.canonicalPlan({ brief: { ...brief, launchDate: "2026-11-11" }, kit: t.kit }), "fingerprint changes with the plan");
