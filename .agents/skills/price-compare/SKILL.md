---
name: price-compare
description: Compares prices for a specific travel product (flights, hotels, tickets, passes) across multiple booking platforms. Use when you need the best price for something specific.
allowed-tools: WebSearch, WebFetch
---

Compare prices across multiple sources for the specified travel product.

**Product to compare**: $ARGUMENTS

## Comparison Process

1. **Identify platforms** to check (minimum 3):
   - Flights: Google Flights, Skyscanner, Kayak, Momondo, airline direct
   - Hotels: Booking.com, Airbnb, Hotels.com, Agoda, hotel direct
   - Attractions: Official site, GetYourGuide, Viator, Klook, KKday
   - Transport: Official operator, Rome2Rio, Trainline, local booking sites

2. **Search each platform** using WebSearch and WebFetch

3. **Normalize results**: same dates, same product, same currency

4. **Rank by total value** (not just price — include cancellation, inclusions, reviews)

## Output Format

```
### Price Comparison: [Product]

| Platform | Price | Cancellation | Extras | Link |
|----------|-------|-------------|--------|------|
| [Name] | [Price] | [Policy] | [What's included] | [URL] |
| [Name] | [Price] | [Policy] | [What's included] | [URL] |

**Best Price**: [Platform] at [Price]
**Best Value**: [Platform] — [Why, if different from cheapest]
**Book at**: [URL]

**Notes**:
- [Price volatility warning if applicable]
- [Coupon codes or promotions found]
- [Better dates nearby if significantly cheaper]
```
