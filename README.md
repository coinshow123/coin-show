# Bourse Board: setup and launch guide

This folder is your complete website. **Your Google Sheet is the admin panel.** You add, approve and feature shows there, then press **Bourse Board › Publish site now**. About 2 minutes later the website is updated. You never touch code.

## What it costs

| Item | Cost |
|---|---|
| Domain name (for example bourseboard.com) | about $12–20 per year |
| Hosting (GitHub Pages) | $0 |
| Google Sheet, admin menu, Google Form | $0 |
| Email list (MailerLite or similar, optional) | $0 up to about 1,000 subscribers |
| **Total** | **about $12–20 per year** |

Setup time: about 2–3 hours, once.

## How it works

```
Google Sheet  (private, only you can see it)
   │  you press  Bourse Board › Publish site now   (or it runs nightly)
   ▼
Approved shows are saved to GitHub
   │  GitHub runs build.js and makes ~300 pages
   ▼
Your website  (free hosting, your domain)
```

Your sheet **stays private**. Only shows marked `approved` are sent to the website. Promoters' names and emails never leave the sheet.

## The admin menu

| Menu item | What it does |
|---|---|
| **Publish site now** | Checks for mistakes, then sends approved shows and dealers to the website. Live in about 2–3 minutes. |
| **Check for problems** | Lists rows with missing or wrong info (bad dates, wrong state, duplicates). |
| **Approve selected submission** | In the Form Responses tab, click a promoter's submission and choose this. It's copied into Shows for you, as approved or pending. |
| **Archive past shows** | Moves finished shows to the Archive tab to keep your list short. |
| **What's expiring (paid)** | Lists featured listings and Dealer Pro plans that expire within 14 days. |
| Settings › **Turn nightly auto-publish on or off** | Publishes your changes automatically every morning around 5am. |
| **Help** | Everyday instructions, plus how to make a GitHub token. |

**Tabs:**
- **Overview** is your dashboard: upcoming shows, pending reviews, featured shows, dealers listed, money in this month and this year, what's expiring, and last published.
- **Shows** has dropdowns and checkboxes, so typos can't happen. Yellow = pending, gold = featured, gray = over, red cell = missing info.
- **Dealers** lists who's setting up at each show.
- **Paid** records who paid, how much, and when it expires. Orange = expires soon, red = expired.
- **Archive** holds old shows.

---

## Step 1. Put the shows in a Google Sheet (10 minutes)

1. Go to sheets.google.com and create a blank sheet. Name it **Bourse Board Admin**.
2. **File › Import › Upload**, choose `data/shows.csv`, and pick **Replace current sheet**. Rename that tab **Shows**.
3. **File › Import › Upload** again, choose `data/dealers.csv`, and pick **Insert new sheet**. Rename that tab **Dealers**.
4. **Don't share or publish this sheet.** It stays private to you.

## Step 2. Add the admin menu (10 minutes)

1. In the sheet, open **Extensions › Apps Script**.
2. Delete what's in the code box, then paste in **everything** from `admin/BourseBoardAdmin.gs` (open it with Notepad or TextEdit).
3. Click the **Save** icon, then close that tab and **reload the sheet**. A **Bourse Board** menu appears at the top.
4. Choose **Bourse Board › Settings › 1. Set up admin sheet**.
   - The first time, Google asks for permission. Click **Continue**, pick your account, then **Advanced › Go to (your project) (unsafe)** and **Allow**.
   - Google shows that warning for any script that isn't published in its store. This one is your own and only works on your sheet.
5. The Overview, Paid and Archive tabs appear, and the Shows tab gets dropdowns, checkboxes and colors.

## Step 3. Make the "Submit a show" form (20 minutes)

1. Go to forms.google.com and create a form named **List your coin show**.
2. Add these questions: Show name, First day, Last day, Public hours, Venue name, Street address, City, State, ZIP, Admission, Parking, Number of dealer tables, What collectors will find (checkboxes: U.S. coins, World coins, Ancient, Paper money, Bullion, Tokens and medals, Stamps), Extras (checkboxes: Auction, Grading submissions, Free appraisals, Exhibits, Kids' program, Door prizes, Talks), Show hotel, Website or Facebook page, Club or organizer, Anything collectors should know, Your name, Your email.
3. On the **Responses** tab, click **Link to Sheets › Select existing spreadsheet**, and choose **Bourse Board Admin**. A **Form Responses 1** tab appears.
4. Click **Send › link icon** and copy the link. Paste it into `submitFormUrl` in Step 4.

## Step 4. Fill in config.json (5 minutes)

Open `config.json` in any text editor (Notepad or TextEdit) and change:

- `siteUrl`: your web address, like `https://www.bourseboard.com`. Until you buy a domain, use the GitHub address from Step 5.
- `customDomain`: `www.bourseboard.com` once you own it. Leave it empty until then.
- `submitFormUrl`: the Google Form link from Step 3.
- `contactEmail`: the email for promoters and corrections.
- `emailSignupUrl`: optional. Your MailerLite or Mailchimp signup page link.
- `featuredPrice`: optional, like `$49 for 30 days`.
- `googleAnalyticsId`: optional, like `G-XXXXXXX`, to count visitors.

Leave `sheetCsvUrl` and `dealersCsvUrl` empty. The admin menu handles that now.

## Step 5. Put the site on GitHub (30 minutes)

1. Create a free account at github.com.
2. Click **New repository**, name it `bourse-board`, choose **Public** (free Pages hosting needs public), and click **Create**.
3. Click **uploading an existing file**. Drag in **everything inside this folder**, including the `.github` folder, then click **Commit changes**.
   - On a Mac, press **Cmd + Shift + .** in Finder to see the hidden `.github` folder.
4. Go to **Settings › Pages**. Under **Source**, choose **GitHub Actions**.
5. Go to the **Actions** tab, click **Build and publish site**, then **Run workflow**.
6. After about 2 minutes, your site is live at `https://YOUR-USERNAME.github.io/bourse-board/`. Put that address in `siteUrl` in config.json.

## Step 6. Connect your sheet to GitHub (10 minutes)

1. On GitHub, go to **your photo › Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token**.
2. Fill it in:
   - Name: **Bourse Board sheet**
   - Expiration: **1 year**
   - Repository access: **Only select repositories › bourse-board**
   - Permissions › Repository permissions › **Contents: Read and write**
3. Click **Generate** and copy the token. It starts with `github_pat_`.
4. In your sheet, choose **Bourse Board › Settings › 2. Connect to GitHub**, and enter your username, `bourse-board`, and the token.
5. Try it: **Bourse Board › Publish site now**.

> Treat the token like a password. Only people who can edit your sheet's script can see it, so don't share edit access to the sheet. It expires in a year; GitHub emails you first, and you repeat this step.

## Step 7. Connect your domain (20 minutes, plus up to a day to take effect)

1. Buy the domain at Namecheap, Cloudflare, Google/Squarespace Domains, or Shopify Domains.
2. In the domain's **DNS settings**, add:
   - Four **A** records for `@`, pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`
   - One **CNAME** record for `www`, pointing to `YOUR-USERNAME.github.io`
3. In config.json, set `customDomain` to `www.yourdomain.com` and `siteUrl` to `https://www.yourdomain.com`. Upload the changed file to GitHub.
4. In GitHub, go to **Settings › Pages**, type the domain under **Custom domain**, save, and check **Enforce HTTPS** once it's available.

## Step 8. Tell Google (15 minutes)

1. Go to search.google.com/search-console, then **Add property › Domain**.
2. Verify by adding the TXT record Google gives you to your DNS.
3. Under **Sitemaps**, submit `sitemap.xml`.
4. Use **URL inspection** on your home page and click **Request indexing**.

State pages like "Coin Shows in California" usually start appearing in Google within 2–8 weeks.

---

## The columns in your Shows tab

| Column | What to put | Example |
|---|---|---|
| status | Dropdown: `approved` shows it on the site. `pending` or `hidden` keeps it off. | approved |
| start_date | First day | 2027-01-07 or 1/7/2027 |
| end_date | Last day (leave blank for one-day shows) | 2027-01-10 |
| show_name | Name | FUN Convention (72nd) |
| city, state | City and 2-letter state | Orlando, FL |
| venue | Building name | Orange County Convention Center |
| address, zip | Street and ZIP (makes "near me" more accurate) | 9800 International Dr, 32819 |
| tier | `major`, `regional`, `local` or `dealer` | major |
| hours | Public hours | Thu 10–6:30, Sun 10–3 |
| admission | Price, or Free | Free |
| website | Organizer's site | funtopics.com |
| organizer | Club or company | Florida United Numismatists |
| notes | One or two sentences in your own words | 1,500+ dealers, Heritage auction. |
| confirm_dates | Checkbox: shows a "please confirm" warning | ☑ |
| featured | Checkbox: paid featured listing (gold badge, shown first) | ☑ |
| lat, lon | Only if a city isn't found on the map | 38.45, -81.93 |

**Show page extras.** These are all optional. Leave a column empty and that part of the page quietly hides.

| Column | What to put | Example |
|---|---|---|
| show_id | A short code you make up, needed only if you list dealers | FUN27 |
| dealer_tables | Number or a short phrase (shown in the quick facts bar) | 120, or 1,500+ dealers |
| parking | Cost and where | Free in the main lot |
| specialties | What collectors will find, separated by commas | U.S. coins, Paper money, Bullion |
| auction | Auction company, or `yes` if you don't know which | Heritage Auctions |
| grading | Grading services taking submissions on site | PCGS, NGC, PMG |
| appraisals, exhibits, kids, door_prizes, talks | Checkboxes: tick if the show has it | ☑ |
| hotel | Show hotel, rate, booking deadline | Hilton, $159/night, book by Dec 10 |
| description | Longer write-up, a few paragraphs (shown for major and featured shows) | |
| photos | Photo file names, separated by commas (shown for major and featured shows) | fun-floor.jpg, fun-entrance.jpg |

**Photos:** put the photo files in a folder named `photos` in your GitHub repository, then type their file names in the photos column. Use your own photos, or ones the promoter sends you with permission.

### Dealers at each show

1. The **Dealers** tab (Step 1) holds every dealer at every show.
2. Columns: `status` (approved), `show_id` (must match the show's show_id), `dealer`, `table`, `city`, `state`.
3. The show page lists them A to Z, like: **Collectibles & Currency #412 Rancho Cordova, CA**. A search box appears once a show has more than 15 dealers.
4. Press **Publish site now** and the lists appear on the show pages.

## Your routine (about 1 hour a month)

- **Add or fix a show:** edit the Shows tab, then **Publish site now**, or let nightly auto-publish do it.
- **New submission:** Form Responses tab › click it › **Approve selected submission** › check the details › **Publish site now**.
- **Featured listing sold:** tick **featured** on the show, then add a row in **Paid** with the expiry date. Take payment with a Stripe or PayPal payment link, never by card number over email.
- **Dealer list:** add rows in the **Dealers** tab using the show's show_id.
- **Once a month:** **What's expiring** to renew or turn off paid listings, and **Archive past shows**.
- Past shows disappear from the website by themselves.

## If something goes wrong

- **"Publish site now" says GitHub error 401 or 403:** your token expired or was typed wrong. Make a new one (Bourse Board › Help) and use Settings › 2. Connect to GitHub again.
- **The Actions tab on GitHub shows a red X:** click it, open **Build the site**, and read the last lines. It tells you which spreadsheet row has a problem (for example, a date it couldn't read). Fix the row, then Publish again. **Your site stays up while you fix it**, because the last good version stays live.
- **"Near me" distance looks wrong for a show:** add its ZIP code, or lat and lon, in the sheet.
- **GitHub email about a disabled workflow:** GitHub pauses daily runs after 60 days with no changes to the files. Click the link in the email to turn it back on, or make any small edit to the repository.

## Trying it on your own computer (optional)

Install Node.js (nodejs.org, the LTS version). In this folder, run `node build.js --preview`, then open `dist/index.html` in your browser.

## What's in this folder

- `build.js`: makes the website from the sheet
- `config.json`: your settings
- `assets/style.css`, `assets/app.js`: the look, plus the menu, slider, pages and near-me search
- `admin/BourseBoardAdmin.gs`: the admin menu for Google Sheets
- `data/shows.csv`, `data/dealers.csv`: the starting lists (import into your sheet). After setup, the Publish button keeps these files updated for you.
- `data/cities.json`, `data/zip3.json`, `data/state-centers.json`: map locations used for distances
- `.github/workflows/deploy.yml`: the daily automatic rebuild
