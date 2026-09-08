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

### Storage: leads.json

Leads are appended to `leads.json` as a JSON array by `server.js` — a zero-dependency
Node server that also serves the page.

```bash
node server.js            # http://localhost:4891
PORT=8080 node server.js
LEADS_FILE=/data/leads.json node server.js
```

The page posts to a relative `/api/leads`, so it works on whatever host serves it
with no CORS involved. Point `LEAD_ENDPOINT` at an absolute URL if the API moves.

Each record holds: `leadId`, name, clinic, phone (E.164), `capturedAt` (browser),
`receivedAt` (server), page, referrer, the five `utm_*` fields, and user agent.

**`leads.json` is gitignored.** It holds real names and phone numbers; it must not
end up in the repository.

Properties worth knowing:

- **Appends, never overwrites.** Existing leads are read, the new one pushed, the
  whole array rewritten.
- **Writes are atomic.** Each write goes to `leads.json.tmp` and is renamed into
  place, so a crash mid-write cannot truncate the file.
- **Writes are serialised.** Every append runs through one promise chain, so
  simultaneous submissions cannot interleave a read-modify-write and lose one.
  Verified against 25 concurrent posts.
- **Duplicates are dropped** on `leadId`, so the browser's retry cannot double-write.
- **Validated server-side.** Name, clinic and a parseable phone are required
  regardless of what the client sent; the phone is re-normalised on arrival.
- **A corrupt file is preserved**, moved to `leads.json.corrupt-<timestamp>` rather
  than silently replaced with an empty array.

### Why not Google Sheets

An Apps Script web app was tried first and abandoned. Deployments under both a
Workspace account and a personal account returned **403 "You need access"** to
anonymous requests, confirmed from `curl` and from a browser with no Google
session, with *Execute as: Me* and *Who has access: Anyone* saved. Workspace
domains can disable anonymous Apps Script web apps by policy. The script that was
written is kept at [`apps-script/Code.gs`](apps-script/Code.gs) if anyone wants to
retry that route; nothing in the page depends on it.

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
node test-server.js   # 24 assertions on storage, spawning a real server
```

Both extract their subject straight out of `leak-calculator.html` — between the
`MODEL START` / `MODEL END` and `LEAD START` / `LEAD END` markers — so there is one
source of truth and the tests cannot drift from the page.

`test-model.js` covers stage-sum integrity, the derived-target arithmetic, the
ceiling clamp, monotonicity and degenerate inputs. `test-lead.js` covers the nine
phone formats above, junk rejection, mandatory-field enforcement, and UTM capture.

`test-server.js` spawns a real server on a throwaway port and leads file, then
checks appending, dedupe, server-side validation, restart persistence, and 25
concurrent writes landing without loss.

## Before it goes live

- [ ] **Book a demo** points at `#book` — needs the real Calendly or form URL
- [ ] `server.js` has to be running and reachable wherever the page is hosted —
      a static host alone will capture leads but never store them
- [ ] Back up `leads.json`; it is the only copy
- [ ] Add a privacy policy link to the gate
- [ ] Replace benchmark rates with real Clinica data if available
- [ ] Decide whether to add case acceptance as a fourth stage (often the largest
      leak in aesthetics; the waterfall takes it without restructuring)
