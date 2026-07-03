# Conviction Engine — Agentic Portfolio Intelligence

A personal "investment brain": a multi-stage intelligence pipeline plus a decision dashboard that turns raw market data into graded, framework-driven portfolio judgment — and then grades its own advice. Built for a concentrated Indian equity portfolio and run as a living system for over a year (25+ shipped phases).

> **Status:** personal production system, source-available. The personal dataset (holdings, trades, generated insights) is excluded from this repo; the full pipeline and dashboard code are real and complete. Built solo with an AI-native workflow — every phase has a PRD, and the system itself is operated through agent skills.

## The idea

Most portfolio tools show you data. This system encodes an investment *philosophy* — a synthesis of quality-and-patience investing, India-macro anticipation, and explicit inversion tests — as executable analysis. Signals, screeners, and reviews all run through the same conviction frameworks, so the machine argues the way its owner thinks. And because advice is cheap, it keeps score: the **Alpha Ledger** grades every recommendation the system has made against the Nifty benchmark, turning hindsight into a feedback loop.

## Architecture

```
                    ┌── fetch-universe / fundamentals / news / NSE actions & calendar
  DATA LAYER        ├── fetch-benchmark / backtest / counterfactual prices
  (scripts/)        └── tradebook + broker (Kite) exports          [personal, excluded]
                                    │
  INTELLIGENCE      ├── detect-signals        — event & price-action signals
  PIPELINE          ├── screen-breakouts      — technical screener with backtests
                    ├── build-fundamentals    — filings & results synthesis
                    ├── build-decision-ledger — every buy/hold/exit call, timestamped
                    └── build-rearview        — counterfactual "what if" analysis
                                    │
  JUDGMENT          ├── conviction frameworks (multi-lens scoring)
  LAYER             ├── re-underwriting cycles — no position survives by default
                    └── Alpha Ledger — grades the system's own advice vs benchmark
                                    │
  DASHBOARD         └── React/Vite command center — Today, PM review, Screener,
     (src/)             Rearview, Concentration Engine, Street Consensus tabs
```

## What's interesting here

- **The system grades itself.** The decision ledger + Alpha Ledger + rearview counterfactuals make every recommendation falsifiable. Most personal finance tooling has no memory; this one is built around accountability.
- **Philosophy as code.** Allocation shape (`src/config/idealPortfolio.js`), conviction buckets, concentration limits, and re-underwriting rules are declarative and versioned.
- **Agent-operated.** The pipeline is designed to be driven by AI agents with skills: refresh rituals, escalation rules, and analysis playbooks are part of the repo's operating model.
- **25+ phases, PRD-first.** The system evolved like a product, not a script pile — each phase shipped against a written PRD with explicit success criteria.

## Stack

React + Vite + Tailwind dashboard · Node.js data pipeline (15+ fetch/build/detect scripts) · NSE/market data sources · Zerodha Kite integration (personal layer, excluded) · Vercel

## Running it

```bash
npm install && npm run dev
```

The dashboard expects generated datasets in `src/data/` (see `src/data/README.md`). The generation scripts are included; they run against public market-data sources plus a personal broker export that is not part of this repo.

## License

MIT
