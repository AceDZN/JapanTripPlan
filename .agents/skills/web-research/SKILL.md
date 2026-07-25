---
name: web-research
description: Deep web research on a topic. Searches multiple sources, cross-references information, and returns verified findings with source URLs. Use when an agent needs thorough research beyond a single search query.
allowed-tools: WebSearch, WebFetch
---

Perform deep web research on the given topic.

**Topic**: $ARGUMENTS

## Research Protocol

1. **Broad search**: Run 2-3 WebSearch queries with different phrasings to get diverse results
2. **Deep dive**: Use WebFetch on the most promising results to extract detailed information
3. **Cross-reference**: Verify key facts (prices, dates, hours) across at least 2 sources
4. **Recency check**: Prefer sources from the last 6 months; flag older data

## Output Requirements

For each finding:
- State the fact/information clearly
- Include the source URL
- Note the date of the source if available
- Rate confidence: HIGH (multiple sources agree), MEDIUM (single reliable source), LOW (unverified or outdated)

## Structure

```
### [Topic Summary]

**Key Findings:**
1. [Finding] — [Source URL] — Confidence: [HIGH/MEDIUM/LOW]
2. [Finding] — [Source URL] — Confidence: [HIGH/MEDIUM/LOW]

**Conflicting Information:**
- [Where sources disagree and which to trust]

**Data Gaps:**
- [What couldn't be verified or found]
```
