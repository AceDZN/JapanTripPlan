# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Trip planning agent swarm built entirely with **Claude Code agents and skills** — no external runtime or TypeScript needed. The orchestrator coordinates 9 specialist sub-agents that use WebSearch/WebFetch to research and plan comprehensive travel itineraries.

## How to Use

Invoke the orchestrator agent:
```
/trip-planner
```
Or ask naturally: "Plan a trip to Japan for 2 weeks in October" — Claude will automatically delegate to the trip-planner agent.

Individual agents can be invoked directly for focused tasks:
```
/flight-catcher          # Search flights
/bnb-finder              # Search accommodation
/attraction-guy          # Find attractions
/food-planner            # Restaurant recommendations
/transport-finder        # Transit planning
/weather-scout           # Weather check
/local-tips              # Cultural/practical tips
/budget-tracker          # Budget analysis
/itinerary-optimizer     # Optimize schedule
```

Skills can be used by agents or invoked directly:
```
/web-research [topic]
/price-compare [product]
/source-verify [claim]
/route-planner [locations]
/budget-analyze [costs]
```

## Architecture

### Agents (`.claude/agents/`)

The **trip-planner** orchestrator (Opus) delegates to sub-agents via the Task tool in 7 phases:

| Phase | Agents (parallel within phase) | Model |
|-------|-------------------------------|-------|
| 1 - Context | weather-scout, local-tips | haiku |
| 2 - Flights | flight-catcher | sonnet |
| 3 - Core Research | bnb-finder, attraction-guy, food-planner | sonnet |
| 4 - Transport | transport-finder | sonnet |
| 5 - Optimize | itinerary-optimizer | sonnet |
| 6 - Budget | budget-tracker | haiku |
| 7 - Synthesis | orchestrator assembles final plan | opus |

Phases are sequential (each needs results from prior phases). Agents within the same phase run in parallel.

### Skills (`.claude/skills/`)

Reusable capabilities that agents (or the user) can invoke:
- **web-research** — multi-query deep research with cross-referencing and confidence ratings
- **price-compare** — compares prices across 3+ booking platforms for a specific product
- **source-verify** — verifies a claim against primary sources, flags outdated info
- **route-planner** — optimizes visit order between multiple locations
- **budget-analyze** — quick budget check with per-person/per-day breakdown

### How Agents Research

All research agents use Claude Code's built-in tools — no APIs or TypeScript required:
- **WebSearch** — searches the web for flights, hotels, attractions, prices, weather, tips
- **WebFetch** — fetches specific pages for detailed pricing, menus, timetables, booking info

### Data Flow

```
User constraints → trip-planner (orchestrator)
  ├─ Phase 1: weather-scout + local-tips → context
  ├─ Phase 2: flight-catcher → flight times/prices
  ├─ Phase 3: bnb-finder + attraction-guy + food-planner → places
  ├─ Phase 4: transport-finder → routes/passes
  ├─ Phase 5: itinerary-optimizer → day-by-day schedule
  ├─ Phase 6: budget-tracker → cost analysis
  └─ Phase 7: orchestrator → final travel plan (markdown)
```

## Critical Conventions

### Evidence-Based Pricing
Every priced recommendation (flights, hotels, tickets, transport) MUST include a source URL where the user can verify or book. Agents are instructed to flag confidence levels.

### Agent Context Passing
Agents don't share state. The orchestrator must pass all relevant context from earlier phases to later agents in the Task prompt. This is the most important orchestration rule.

### Model Selection
- **Opus**: orchestrator only (complex coordination, final synthesis)
- **Sonnet**: research agents (flight-catcher, bnb-finder, attraction-guy, food-planner, transport-finder, itinerary-optimizer) — need strong reasoning for research
- **Haiku**: info agents (weather-scout, local-tips, budget-tracker) — simpler aggregation tasks
