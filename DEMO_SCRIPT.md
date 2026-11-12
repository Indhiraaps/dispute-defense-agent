# Demo video script (about 3 minutes)

Recorded on the live site: **https://dispute-defense-agent.onrender.com**

## Before you record (10 minutes)

1. **Wake the site:** open it 5 minutes early and sign in (any username, your `APP_PASSWORD`).
2. **Check the starting state:** the inbox shows the 3 demo disputes as **Needs your approval**, and the PayPal dispute `PP-R-IVY-10200275` as **Resolved**, with **1 won** under "Results so far".
3. **If a rehearsal changed things** (you approved something), reset the live site: in Render open the service, then **Manual Deploy** → **Restart service** (or **Deploy latest commit**). A restart reloads the clean snapshot.
4. **Recorder:** Windows **Game Bar** (`Win + Alt + R` starts and stops recording), or OBS Studio (free). Record the browser window at 1080p. Zoom the browser to 110–125% so text is readable.
5. Close other tabs and notifications. Keep this script open on your phone.

## The script

Times are a guide. **Say** = what you say; **Do** = what you click.

### 0:00–0:20 · The problem

**Do:** Show the inbox.

**Say:** "When a buyer opens a PayPal dispute, a small seller has days to find the tracking, the delivery proof and the messages, or they lose by default. PayPal's own AI toolkit can *accept* a dispute, but it can't fight one. Dispute Defense Agent can: honestly, and with the seller in control."

### 0:20–0:40 · The inbox

**Do:** Point at the summary row, then the grid: deadlines, the Recommendation column, the Citations column.

**Say:** "This is the seller's dispute inbox, built on AG Grid. For every dispute the agent has already gathered the evidence and made a recommendation: contest, offer a partial refund, or accept. It also tells the seller when *not* to fight."

### 0:40–1:30 · Scarf: contest, and the citation check

**Do:** Click the **scarf** row (DEMO-1001, Contest · 80).

**Say:** "The buyer says the scarf never arrived. The agent decided which records to fetch, and the score comes from fixed rules, not AI: every point is tied to a record. Tracking matches the address, the carrier shows it delivered, and the buyer even wrote 'Got it, love it!'"

**Do:** Scroll to **What the messages say** (the "Got it" quote), then back up to the **draft**. Click a citation like **[DLV-001]**; it jumps to the record.

**Say:** "The AI drafts the response, and every sentence cites the record that proves it."

**Do:** Open **Edit and check**. At the end, type `The buyer is a known scammer.` and click **Check citations**.

**Say:** "Here's the important part. If anyone, the AI or the seller, adds a claim with no evidence behind it, the citation checker blocks it. Wrong dates and wrong tracking numbers are blocked too. Nothing unprovable reaches PayPal."

**Do:** Click **View the evidence PDF** (it opens in a new tab). Show the cover and index, then scroll to the carrier scan history. Close the tab.

**Say:** "This PDF is what gets uploaded to PayPal: the statement, an index, and every record it cites."

### 1:30–1:55 · Sweater: AI vision and a fair offer

**Do:** Back to the inbox, then the **sweater** row (DEMO-1002, Offer $20.00 · 55). Scroll to **Photo comparison**.

**Say:** "Here the buyer says the navy sweater is black. The agent compared the listing photo with the buyer's photo and found the difference is dim, warm lighting, and the shop's policy says natural dyes vary. The case is mixed, so it recommends a twenty-dollar partial refund instead of a fight."

**Do:** Scroll to **Your decision**, click **Approve and submit…**, then **Yes, approve**. Open **The request that would be sent**.

**Say:** "Nothing is sent until the seller approves. This is a demo dispute, so it shows the exact PayPal request instead of sending it."

### 1:55–2:10 · Mug: knowing when not to fight

**Do:** Back to the inbox, then the **mug** row (DEMO-1003, Accept · 0).

**Say:** "No tracking was ever added, so this case can't be won. The agent recommends accepting early, saving the seller time and fees, and gives a tip for next time: add tracking."

### 2:10–2:45 · Proof on the real PayPal sandbox

**Do:** Back to the inbox, then the **PP-R-IVY-10200275** row. Show **Resolved: won**, then scroll to the **Timeline**.

**Say:** "And this one is real, on PayPal's sandbox. A sandbox buyer opened this dispute. The agent built the case, we uploaded the evidence PDF through PayPal's Disputes API, escalated it to a claim, and PayPal resolved it in the seller's favour. The app pulled PayPal's decision and recorded the win. New disputes now arrive automatically by webhook."

**Do:** Back to the inbox: point at **Results so far: 1 won** and the **What evidence wins** table if it shows.

**Say:** "Every outcome is tracked against the evidence used, so sellers learn what actually wins, measured, not promised."

### 2:45–3:00 · Close

**Say:** "Gemini does the language work, rules do the scoring, code checks every fact, and the seller makes the call. PayPal's toolkit could only accept disputes. Now an agent can defend sellers, honestly."

## If something goes wrong while recording

- **The site is slow to open:** it's waking up. Wait a minute, or cut that part out.
- **Approve shows an error:** say "PayPal isn't ready" only if it's a real PayPal dispute; demo disputes never call PayPal, so this shouldn't happen. Restart the service and record that part again.
- **Don't press "Run the agent again" while recording.** It works, but free Gemini quotas can make it slow. The results shown were produced by the agent beforehand.

## After recording

Upload to **YouTube** (Unlisted is fine) and paste the link into Devpost. Keep it to 3 minutes or less, or whatever Devpost's rules say.
