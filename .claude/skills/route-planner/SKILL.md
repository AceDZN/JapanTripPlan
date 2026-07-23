---
name: route-planner
description: Plans an optimal route between multiple locations in a city or between cities. Considers transport options, travel times, and logical ordering. Use when optimizing the sequence of visits.
allowed-tools: WebSearch, WebFetch
---

Plan the optimal route between the given locations.

**Locations**: $ARGUMENTS

## Planning Process

1. **Identify all locations** and their approximate positions/neighborhoods
2. **Research transport options** between each pair using WebSearch:
   - Walking time (if < 20 minutes)
   - Public transit routes and times
   - Taxi/rideshare estimates
3. **Optimize the order** to minimize total travel time and backtracking
4. **Consider constraints**: opening hours, meal times, rest breaks

## Output Format

```
### Optimized Route

**Total travel time**: ~[Duration] (excluding activity time)
**Transport needed**: [Summary of transit/walking]

**Route Order**:
1. [Location A]
   ↓ [Transport method] — [Duration] — [Cost if any]
2. [Location B]
   ↓ [Transport method] — [Duration]
3. [Location C]
   ...

**Alternative Route**: [If there's a meaningfully different option]
- [Why someone might prefer it]

**Map Reference**: Search "[all locations] map" for visual reference
```
