# Patient leak calculator

A public lead-generation page for UAE aesthetic and dermatology clinics. A clinic
owner answers eight questions and sees, in AED, what their enquiry funnel loses
in a year — split across the three stages where it leaks.

Single self-contained HTML file. No build step, no dependencies except Google Fonts.

```bash
open leak-calculator.html
```

## What it asks

Nobody is asked for a rate. Clinic owners don't know their answer rate or no-show
rate, and asking for one on a public page kills completion and credibility at once.
So the page asks only for things an owner can answer without looking anything up:

| Input | Why they can answer it |
|---|---|
| Enquiries a month | Rough count is fine |
| New patients who actually came in last month | It's in their books |
| Average treatment cost | They know it |
| Marketing spend a month | They know it exactly |
| Who picks up, and when | An operational fact |
| How quickly someone replies | An operational fact |
| Whether reminders go out | An operational fact |
| How often a patient returns | An operational fact |

The four operational questions each map to a rate behind the scenes.

## The model

The one assumption everything answers to: **at its best, a clinic converts 20% of
raw enquiries into attended first appointments.** Spam, price-shoppers,
wrong-treatment messages and duplicates live in the other 80% and are never counted
as a leak — which is why there is no "how many of these are real?" question.

```
patients today       = enquiries × answer × book × show     (or their real number, which wins)
best case            = enquiries × 0.20
LEAK                 = (best case − today) × treatment cost
```

Stage attribution isolates one lever at a time, so the three stages sum to the
headline exactly, with no double-counting:

```
unanswered   = E × (answer* − answer) × book  × show
never booked = E ×  answer* × (book* − book)  × show
no-shows     = E ×  answer* ×  book* × (show* − show)
```

If the owner entered their real patient count, the three stages are rescaled to fill
the gap that number implies. The model never argues with their books.

### Benchmarks

`BEST_CASE` is the authoritative constant; the booking target is *derived* from it
so the three stage targets always multiply to exactly 20%. Move the answer or show
benchmark and the arithmetic stays consistent.

| Stage | Best case |
|---|---|
| Enquiries answered | 90% |
| Answered enquiries that book | 25% (derived) |
| Booked patients who attend | 90% |
| **Enquiries that become patients** | **20%** |

Rates are measured against **raw** enquiries, not filtered ones, which is why the
booking figures look lower than a CRM's "qualified lead" conversion rate.

> These are industry-typical figures set by judgement, not a published UAE study.
> They are stated openly in the page's own "How this is calculated" panel, and the
> page tells the reader it is an estimate rather than an audit. Replace them with
> real Clinica conversion data when it's available — the rate tables and `TARGET`
> sit together at the top of the model block.

**If you change `BEST_CASE`, recalibrate the current-state rate tables with it.**
The two are coupled: leave the tables against an old, higher ceiling and a typical
clinic's answers will already brush the new cap, silently collapsing the result
toward zero.

## Tests

```bash
node test-model.js
```

19 assertions covering stage-sum integrity, the derived-target arithmetic, the
ceiling clamp, monotonicity, and degenerate inputs. The test extracts the model
straight out of `leak-calculator.html` between the `MODEL START` / `MODEL END`
markers, so there is one source of truth and the tests cannot drift from the page.

## Before it goes live

- [ ] **Book a demo** points at `#book` — needs the real Calendly or form URL
- [ ] Replace benchmark rates with real Clinica data if available
- [ ] Decide whether to add case acceptance as a fourth stage (often the largest
      leak in aesthetics; the waterfall takes it without restructuring)
