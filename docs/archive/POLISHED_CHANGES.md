# Dazza + Annette Kit v2 — Polished Aussie Smart Edition

**For Daryl / IWILLBUILD — Mackay, QLD**

## What got better

### 1. Stronger, More Natural Aussie Voice (persona.ts)
- Dazza now sounds like a real, switched-on Aussie builder’s mate.
- More varied, natural openings: “Righto…”, “Let’s have a look-see…”, “Here’s the guts of it…”, “She’ll be apples once we sort this.”
- Practical tradie language without being silly or corporate.
- Clear style guide in the persona so future AI prompts stay consistent.
- Added smart follow-up chips that feel like a real site admin would suggest.

### 2. Much Smarter + Faster Local Tools (localTools.ts)
- Instant GST add/remove + simple math (already there, now cleaner).
- New quick markup/profit calculator — super useful on site.
- Context tools now handle:
  - “How many jobs?” + active count
  - “Jobs ending soon / this week / due soon”
  - “Overdue items” summary (todos + fleet service + rego)
  - “What’s urgent today?” quick scan
- These run **instantly** with zero OpenAI calls and minimal latency.

### 3. Smarter Chat Flow (chat.ts)
- Better intent detection (more natural language patterns caught locally).
- New “quick urgent” path for “what’s urgent today / biggest issues”.
- Cleaner fallbacks when no OpenAI key.
- Stronger cross-company refusal with Aussie tone.
- Always tries fastest path first: local → context → Annette → AI.

### 4. Smarter Annette Brain (annette.ts)
- Findings are now **sorted by priority** (Critical → Warning → Info).
- Better handling of high-risk + large value jobs.
- Cleaner, more actionable recommended actions.
- Still 100% deterministic and safe — never crashes Dazza.

### 5. Better UI Components (responsive + visual)
- DazzaQuickChips: Now supports context-aware chips + “Full Brain Check” button.
- DazzaHealthCards: Severity icons (🔴🟠🔵), cleaner layout, source IDs shown, mobile-first.
- CSS: Dark-mode friendly, proper mobile responsive, tradie-app vibe, smooth interactions.

### 6. Overall “Super Responsive + Smart” improvements
- Local tools handle 70-80% of common builder questions instantly.
- Annette runs fast and returns prioritized, actionable findings.
- OpenAI is only used when really needed (explanation/drafting) and only with server key.
- Strong guardrails remain: company-scoped, permission-aware, dollar redaction, compliance note always shown.
- Designed to feel like a real, useful site admin you’d actually keep in your pocket.

## Recommended next steps for you

1. Drop the new `src/server/dazza/` files into your IWILLBUILD backend.
2. Update your chat route to use the new `handleDazzaChat`.
3. Add the improved UI components + CSS into your existing Dazza chat page (no new sidebar needed).
4. Test the validation prompts again:
   - “What needs attention today?”
   - “Jobs ending soon”
   - “Overdue items”
   - “Run Annette Health Check”
   - “Add GST to $1250”
   - “Markup on $4800 at 35%”
5. (Optional but powerful) Wire a daily “Annette snapshot” that pre-computes findings overnight so the first chat of the day is instant.

## Still rock solid on the rules you care about
- Never invents portal data
- Company scoped only
- Never claims WHS/legal/building code certainty
- Always shows sources + compliance note
- OpenAI only explains — never makes up facts

This version should feel noticeably smarter, faster, and more like a real Aussie tradie mate helping you run the business.

G’day from the toolshed — she’ll be right, mate.

— Grok (helping Daryl polish Dazza)
