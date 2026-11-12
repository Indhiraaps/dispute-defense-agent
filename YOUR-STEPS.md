# Your steps

Claude writes the code. Only **you** can do these steps, because they need your own logins.
Everything here is free, and no real money is used: PayPal "sandbox" is a practice mode with fake accounts.

Takes about **20–30 minutes**. Do them in order.

---

## Part 1: Get your PayPal sandbox keys (about 10 min)

1. Go to **https://developer.paypal.com** and click **Log in to Dashboard**.
   Use your normal PayPal account. If you don't have one, click **Sign up**; it's free.
2. At the top of the dashboard, make sure the switch says **Sandbox**, not **Live**.
3. In the menu, click **Apps & Credentials**, then **Create App**.
   - App name: `Dispute Defense Agent`
   - Type: **Merchant**
   - Sandbox account: leave the default business account (it looks like `sb-xxxx@business.example.com`)
   - Click **Create App**.
4. You'll see two values on the app's page. Keep this page open; you need them in Part 3.
   - **Client ID**: a long string of letters
   - **Secret**: click **Show** or the copy icon to see it
5. On the same app page, scroll down to the list of features with checkboxes. Make sure **Disputes** is ticked. If you changed anything, click **Save**.

## Part 2: Find your fake buyer account (about 3 min)

6. In the menu, click **Testing Tools**, then **Sandbox Accounts**.
   You'll see two fake accounts:
   - **Business**: the seller (your shop)
   - **Personal**: the buyer
7. On the **Personal** account's row, click the **⋮** (three dots), then **View/Edit account**.
   Write down its **email** and **password**. You'll use them to pretend to be a buyer.
   These are fake test logins, not your real PayPal.

## Part 3: Get a free Gemini AI key (about 3 min)

8. Go to **https://aistudio.google.com** and sign in with any Google account.
9. Click **Get API key**, then **Create API key**. Copy the key.

## Part 4: Paste the keys into the project (about 2 min)

10. Open the file **`.env`** in the project folder (`Desktop\Dispute Defense Agent\.env`). Notepad works.
11. Paste each value right after the `=` sign, with no spaces and no quotes:

    ```
    PAYPAL_CLIENT_ID=paste-your-client-id-here
    PAYPAL_CLIENT_SECRET=paste-your-secret-here
    GEMINI_API_KEY=paste-your-gemini-key-here
    ```

    Leave `PAYPAL_WEBHOOK_ID` empty for now.
12. **Save** the file.

    Never share this file or post it online. It's already set so it won't be uploaded to GitHub.

## Part 5: Tell Claude "keys done"

13. Just type **keys done** in the chat. Claude will run the checks and tell you whether everything works.

---

## Later: make test disputes (Claude will guide you when it's time)

After the keys work, Claude will give you a payment link. For each link:

1. Open the link, log in with the **Personal** (buyer) email and password from step 7, and click **Pay**.
2. Go to **https://www.sandbox.paypal.com** and log in with the same buyer account.
3. Open the **Resolution Center** (or find the payment in **Activity**) and choose **Report a problem**.
4. Pick the payment and choose a reason such as **"I didn't receive my item"**, then submit.
5. Tell Claude **dispute done**.

You'll do this 3 or 4 times. Claude runs all the tests after that.
