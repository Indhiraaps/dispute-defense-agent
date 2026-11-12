# Deploying to Render (free)

About 20 minutes. Everything here is free and needs no card.

## 1. Put the code on GitHub

1. Go to **https://github.com/new** (create a free account first if you don't have one).
2. Repository name: `dispute-defense-agent`. Choose **Private** for now (you can make it public for Devpost later). Don't tick "Add a README". Click **Create repository**.
3. Copy the repository address shown on the next page. It looks like `https://github.com/YOUR-NAME/dispute-defense-agent.git`.
4. Give that address to Claude. Claude connects your project to it; you then run the push command it gives you. The first push opens a GitHub sign-in window.

Your `.env` file (with your keys) is never uploaded: it's in `.gitignore`.

## 2. Create the Render service

1. Go to **https://render.com** and sign up with **GitHub** (easiest).
2. In the dashboard, click **New** → **Blueprint**.
3. Connect your GitHub account if asked, and pick the `dispute-defense-agent` repository.
4. Render reads `render.yaml` and asks for the secret values. Paste the same values as in your `.env`:
   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `GEMINI_API_KEY`
   - `PAYPAL_DISPUTE_IDS`: `PP-R-IVY-10200275` (plus any newer sandbox dispute IDs)
   - `APP_PASSWORD`: a password of your choice (any username works when signing in)
   - `PAYPAL_WEBHOOK_ID`: leave empty for now (step 3)
5. Click **Apply**. The first build takes about 5 minutes. When it says **Live**, open the URL Render shows, like `https://dispute-defense-agent.onrender.com`.

## 3. Point PayPal's webhook at Render

1. On **developer.paypal.com** → **Apps & Credentials** → your **US** sandbox app → **Webhooks** → **Add Webhook**.
2. Webhook URL: `https://YOUR-APP.onrender.com/api/webhooks/paypal`
3. Events: tick **Customer dispute created**, **Customer dispute updated** and **Customer dispute resolved** (`CUSTOMER.DISPUTE.CREATED / UPDATED / RESOLVED`). Save.
4. Copy the **Webhook ID** shown, then in Render → your service → **Environment**, set `PAYPAL_WEBHOOK_ID` to it and save. Render restarts the app.

## 4. Check it works

- `https://YOUR-APP.onrender.com/api/health` should show `"ok":true` with `paypal`, `gemini` and `webhookId` all `true`.
- Open the site, sign in with your password: the inbox shows the demo disputes with their recommendations, and your sandbox dispute.

## Good to know

- **Sleep:** the free service sleeps after about 15 minutes without visitors. The first visit then takes about a minute. **Open the site 5 minutes before presenting.**
- **Fresh start every wake-up:** the disk is wiped on restarts, so the app loads `seed/snapshot.json` (the agent's saved work) and re-imports your PayPal disputes. Changes you make on the live site (approvals, edits) last until the next restart. To change the starting point, run the agent locally, then `npm run demo:reset`, `npm run snapshot`, commit and push.
- **Updates:** every push to GitHub redeploys automatically.
