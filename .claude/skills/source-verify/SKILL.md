---
name: source-verify
description: Verifies a specific claim, price, or piece of travel information by checking the original source and cross-referencing. Use when data seems outdated or uncertain.
allowed-tools: WebSearch, WebFetch
---

Verify the following travel information for accuracy and recency.

**Claim to verify**: $ARGUMENTS

## Verification Steps

1. **Find the primary source** — official website, government page, or direct provider
2. **Check the date** — when was this information last updated?
3. **Cross-reference** — find at least one independent confirmation
4. **Check for changes** — search for recent updates or changes to this information

## Output Format

```
### Verification: [Claim]

**Status**: VERIFIED / OUTDATED / UNVERIFIED / INCORRECT

**Primary Source**: [URL]
**Last Updated**: [Date if found]
**Cross-Reference**: [Second source URL]

**Current Information**: [What the data actually is now]
**Discrepancy**: [If different from the original claim, explain what changed]

**Confidence**: HIGH / MEDIUM / LOW
**Reason**: [Why this confidence level]
```
