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

## Lead gate

The calculator is gated. On first visit a dialog collects **name, clinic name and
phone number** — all three mandatory — over a blurred preview of the page. Nothing
is reachable behind it: the calculator is `aria-hidden`, unfocusable and
non-interactive until the form passes.

Once through, the visitor is remembered in `localStorage` and never re-gated.

Phone input accepts what UAE clinic staff actually type — `050 123 4567`,
`0501234567`, `50 123 4567`, `04 123 4567`, or a full international number pasted
with a `+` — and stores everything as E.164 (`+971501234567`).

### Storage: Google Sheet

Leads append as rows to a Google Sheet through an Apps Script web app.

**The Sheet already exists:**
[Patient leak calculator — Leads](https://docs.google.com/spreadsheets/d/1zoa46RLC_kWlM6EUrtjyLXWJ9QD2qtc6cjy--aCBV50/edit)
(`1zoa46RLC_kWlM6EUrtjyLXWJ9QD2qtc6cjy--aCBV50`). It is empty on purpose — the
script creates the `Leads` tab, headers and column formatting on the first
submission. Delete the leftover `Sheet1` tab once real rows arrive.

Remaining steps, which need your Google account:

1. Open the Sheet above, then **Extensions → Apps Script**
2. Replace the default `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs), and save
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** — required, the page posts anonymously
4. Copy the `/exec` URL into `LEAD_ENDPOINT` near the bottom of `leak-calculator.html`
5. Open the `/exec` URL in a browser once. It should return `{"ok":true,...}`

Re-deploy as a **new version** after editing the script, or the live URL keeps
running the old code.

Each row records: received timestamp, name, clinic, phone, lead ID, page URL,
referrer, the five `utm_*` parameters, and user agent. The phone column is forced
to text so Sheets doesn't eat the leading `+`.

### Delivery is best-effort, never blocking

A visitor is **never** held at the gate by a network problem — losing the prospect
costs more than losing the row. If the POST fails, the lead is queued in
`localStorage` and retried on the next visit. Each lead carries a UUID and the
Apps Script deduplicates on it, so a retry can't create a second row.

The POST uses `Content-Type: text/plain` to stay a CORS-simple request (no
preflight, which Apps Script handles badly), with a `no-cors` fallback if the
response can't be read.

### Before you collect real numbers

The page promises *"We use them to send your breakdown and nothing else."* That is
a commitment the business has to keep. Name and phone are personal data under the
UAE's PDPL — make sure the Sheet's sharing is locked down, and add a privacy policy
link to the gate if this runs on a public domain.

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
node test-model.js    # 19 assertions on the leak model
node test-lead.js     # 31 assertions on gate validation and phone normalisation
```

Both extract their subject straight out of `leak-calculator.html` — between the
`MODEL START` / `MODEL END` and `LEAD START` / `LEAD END` markers — so there is one
source of truth and the tests cannot drift from the page.

`test-model.js` covers stage-sum integrity, the derived-target arithmetic, the
ceiling clamp, monotonicity and degenerate inputs. `test-lead.js` covers the nine
phone formats above, junk rejection, mandatory-field enforcement, and UTM capture.

## Before it goes live

- [ ] **Book a demo** points at `#book` — needs the real Calendly or form URL
- [ ] `LEAD_ENDPOINT` is empty — paste the Apps Script `/exec` URL, or no lead is stored
- [ ] Lock down Sheet sharing, and add a privacy policy link to the gate
- [ ] Replace benchmark rates with real Clinica data if available
- [ ] Decide whether to add case acceptance as a fourth stage (often the largest
      leak in aesthetics; the waterfall takes it without restructuring)
