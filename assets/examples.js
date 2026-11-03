// Three made-up example campaigns for the home page and "See an example kit".
import { templateKit, normalizeKit, todayISO, dayDate, isoOf } from "./kit.js";

const soon = (n) => isoOf(dayDate(todayISO(), n));

const DEFS = {
  brewly: {
    emoji: "☕", color: "#FCFCBA",
    brief: { name: "Brewly", what: "A coffee subscription that delivers freshly roasted beans every week", audience: "busy professionals who love good coffee at home", goal: "Signups", channels: ["Instagram", "X", "Email"], budget: "Small", tone: "Friendly", facts: ["First bag ships within 48 hours", "Skip or cancel any week"] },
    positioning: {
      oneLiner: "Fresh beans at your door every week — for people who take their mornings seriously.",
      pitch: "Brewly sends you coffee roasted that week, so every cup tastes the way it should. Skip or cancel any week, no questions asked.",
      messages: ["Roasted this week, not this year", "Skip or cancel any week", "Your first bag ships within 48 hours"],
      proofToGather: ["A quote from a beta subscriber about their first cup", "Photo of the roast date on a real bag", "How many weeks the average tester stayed"],
      useWords: ["fresh", "roasted this week", "your morning", "skip anytime", "at your door"],
      avoidWords: ["artisanal", "world's best", "premium experience", "game-changer"],
    },
    personas: [
      { name: "Maya, the 7am commuter", emoji: "👩‍💼", who: "Works in an office three days a week and makes coffee before the train.", pains: ["Supermarket beans taste flat", "Forgets to reorder", "No time for café queues"], wants: ["Great coffee in 5 minutes", "Never running out", "Easy to pause"], hangouts: ["Instagram", "Morning podcasts", "LinkedIn"], bestMessage: "Your best cup of the week, every weekday — delivered before you run out." },
      { name: "Tom, the home barista", emoji: "🧔", who: "Owns a grinder and a scale, and talks about extraction.", pains: ["Old beans ruin the shot", "Small roasters are hard to find", "Shipping costs add up"], wants: ["Roast dates he can trust", "New origins to try", "Fair price per bag"], hangouts: ["Reddit r/coffee", "YouTube", "X"], bestMessage: "Every bag shows its roast date — and it's always this week." },
    ],
    ads: [
      { angle: "Pain", headline: "Tired of stale supermarket coffee?", description: "Get beans roasted this week, delivered to your door. Skip or cancel any week.", cta: "Start my first bag" },
      { angle: "Benefit", headline: "Roasted this week, at your door", description: "Fresh coffee every week — your first bag ships within 48 hours.", cta: "Get fresh beans" },
      { angle: "Social", headline: "Why mornings got better", description: "[customer quote] ⚠ Add proof — use a real quote from a Brewly subscriber.", cta: "Try Brewly" },
    ],
  },
  studybuddy: {
    emoji: "📚", color: "#DCEEFF",
    brief: { name: "StudyBuddy", what: "A study planner app that fits revision around your lectures", audience: "university students who want better grades without all-nighters", goal: "Launch", channels: ["TikTok", "Instagram", "Community"], budget: "$0 (organic only)", tone: "Playful", facts: ["Free for students"] },
    positioning: {
      oneLiner: "The study planner that works around your lectures — not the other way round.",
      pitch: "StudyBuddy turns your timetable into a revision plan you can actually stick to. It's free for students and takes two minutes to set up.",
      messages: ["Plans around your real timetable", "Small sessions, no all-nighters", "Free for students"],
      proofToGather: ["A quote from a student in the beta", "Screen recording of setup in under 2 minutes", "One before/after study week screenshot"],
      useWords: ["your timetable", "no all-nighters", "free for students", "small wins"],
      avoidWords: ["guaranteed grades", "hack your brain", "productivity guru"],
    },
    personas: [
      { name: "Leo, the last-minute crammer", emoji: "🧑‍🎓", who: "Second-year student who starts revising the week before exams.", pains: ["Panic before deadlines", "Doesn't know where to start", "Too many apps"], wants: ["A plan made for him", "Short sessions", "Feeling on top of things"], hangouts: ["TikTok", "Course Discord", "Instagram stories"], bestMessage: "Tell it your timetable — get a plan that fits around it." },
      { name: "Priya, the organised one", emoji: "👩‍🎓", who: "Colour-codes everything and helps friends plan.", pains: ["Planning takes hours", "Plans break when lectures move", "Friends ask her for help constantly"], wants: ["Faster planning", "Easy to share", "Something that adapts"], hangouts: ["Instagram", "Study-with-me TikTok", "Notion communities"], bestMessage: "Your perfect plan, in two minutes — and it updates when your week does." },
    ],
    ads: [
      { angle: "Pain", headline: "Exams in 3 weeks and no plan?", description: "StudyBuddy builds a revision plan around your lectures in 2 minutes.", cta: "Plan my week" },
      { angle: "Benefit", headline: "Revise in small, doable sessions", description: "No all-nighters. A plan that fits your timetable. Free for students.", cta: "Get it free" },
      { angle: "Social", headline: "Made with students, for students", description: "[student quote] ⚠ Add proof — share what a beta tester said.", cta: "Join the launch" },
    ],
  },
  sunset: {
    emoji: "🧘", color: "#FCD1D3",
    brief: { name: "Sunset Yoga", what: "A small yoga studio opening with evening classes by the beach", audience: "locals who want to unwind after work", goal: "Event attendance", channels: ["Instagram", "Email", "Community", "LinkedIn"], budget: "Small", tone: "Inspiring", facts: ["Opening class is free", "Mats provided"] },
    positioning: {
      oneLiner: "Evening yoga by the beach — the calmest hour of your day.",
      pitch: "Sunset Yoga is a small studio with evening classes right by the water. Come straight from work — mats are provided and the opening class is free.",
      messages: ["Evening classes after work", "Mats provided — just turn up", "Opening class is free"],
      proofToGather: ["Photo of the studio at sunset", "Short intro video from the teacher", "Quote from a friend who joined a trial class"],
      useWords: ["unwind", "by the water", "after work", "all levels welcome"],
      avoidWords: ["detox", "life-changing", "elite", "guaranteed results"],
    },
    personas: [
      { name: "Ana, the desk-bound designer", emoji: "👩‍🎨", who: "Sits at a screen all day and wants to switch off at 6pm.", pains: ["Stiff back and shoulders", "Gyms feel loud", "Classes start too early"], wants: ["A calm evening routine", "Beginner-friendly", "Close to home"], hangouts: ["Instagram", "Local Facebook groups", "Neighbourhood WhatsApp"], bestMessage: "Leave the screen behind — the sunset class starts after work." },
      { name: "Mark, the curious beginner", emoji: "🧑", who: "Has never done yoga and worries he's not flexible enough.", pains: ["Feels out of place", "Doesn't own gear", "Doesn't know the poses"], wants: ["A friendly first class", "No gear needed", "Small groups"], hangouts: ["LinkedIn", "Local running club", "Email newsletters"], bestMessage: "No mat, no experience, no problem — your first class is on us." },
      { name: "Lucy, the regular", emoji: "🧘‍♀️", who: "Practises twice a week and wants a nicer setting.", pains: ["Crowded studios", "Same routine every week", "Hard to find evening slots"], wants: ["Small classes", "A beautiful place", "Teachers who know her"], hangouts: ["Instagram", "Yoga communities", "Email"], bestMessage: "Small classes, sea air and a teacher who knows your name." },
    ],
    ads: [
      { angle: "Pain", headline: "Long day at the desk?", description: "Unwind with evening yoga by the beach. Mats provided — just turn up.", cta: "Book a class" },
      { angle: "Benefit", headline: "The calmest hour of your day", description: "Evening classes by the water, all levels welcome. Opening class is free.", cta: "Save my spot" },
      { angle: "Social", headline: "Why locals love the sunset class", description: "[member quote] ⚠ Add proof — share a real quote after opening week.", cta: "Join us" },
    ],
  },
};

export const EXAMPLE_IDS = Object.keys(DEFS);
export const exampleMeta = (id) => DEFS[id] && { id, emoji: DEFS[id].emoji, color: DEFS[id].color, ...DEFS[id].brief, oneLiner: DEFS[id].positioning.oneLiner };

export function exampleCampaign(id) {
  const d = DEFS[id];
  if (!d) return null;
  const brief = { ...d.brief, launchDate: soon(id === "brewly" ? 5 : id === "studybuddy" ? 9 : 12), website: "" };
  const raw = { ...templateKit(brief), positioning: d.positioning, personas: d.personas, ads: d.ads };
  const { kit } = normalizeKit(raw, brief);
  return { brief, kit, example: id };
}
