---
name: budget-analyze
description: Analyzes a set of costs against a budget. Calculates totals, identifies where the budget is tight, and suggests adjustments. Use for quick budget checks during planning.
allowed-tools: WebSearch
---

Analyze the following costs against the given budget.

**Input**: $ARGUMENTS

## Analysis

1. **Sum all costs** by category
2. **Convert currencies** if needed (WebSearch for current rates)
3. **Calculate budget fit** — how much over/under
4. **Per-person and per-day** breakdown

## Output Format

```
### Budget Check

| Category | Amount | % of Budget |
|----------|--------|-------------|
| [Category] | [Amount] | [%] |
| **Total** | **[Amount]** | **[%]** |

**Budget**: [Amount]
**Balance**: [+/- Amount] ([Over/Under] budget)
**Per person**: [Amount] | **Per day**: [Amount]

**Verdict**: [On track / Needs cuts / Room to spare]

**Quick Adjustments** (if over):
- [Cut suggestion] → saves [Amount]
```
