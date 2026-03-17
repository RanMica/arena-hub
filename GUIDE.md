# Arena — Team Guide

Everything you need to know to use Arena.

---

## What is Arena?

Arena is a shared platform for the product and design team to create, showcase, and test interactive prototypes. Each prototype can have multiple **variants** — different design solutions for the same feature — that you can toggle between instantly using a segment control.

---

## Browsing Prototypes (for stakeholders)

1. Visit the hub URL shared with you
2. Enter your `@ridewithvia.com` email when prompted
3. Check your inbox for a one-time verification code and enter it
4. Browse the dashboard — click any prototype card to open it
5. Use the **segment control bar** at the top to toggle between variants
6. Click the collapse button to hide the toolbar and get a full-screen view

---

## Setting Up Your Environment (for contributors)

### First-time setup

1. **Install Git** — download from [git-scm.com/downloads](https://git-scm.com/downloads)
2. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR-ORG/Arena.git
   cd Arena
   ```
3. **Start a local server:**
   ```bash
   npx serve .
   ```
4. **Open** `http://localhost:3000` in your browser.

---

## Staying Up to Date

Before starting any work, always pull the latest changes:

```bash
git pull origin main
```

**If you see a merge conflict** (usually in `prototypes.json`): open the file and make sure both entries are present in the JSON array.

---

## Creating a New Prototype

1. **Add yourself to the team roster** (one-time): add your entry to the `"team"` array in `prototypes.json`
2. **Click "New Prototype"** on the dashboard, fill in name and description
3. **Follow the generated instructions** — folder to create + JSON entry to add
4. **Build your prototype** inside the folder. Use Cursor AI to help!

**Important:** Use **relative paths** for all assets (e.g. `css/styles.css`, not `/css/styles.css`).

---

## Adding Variants

1. Create a new subfolder inside your prototype folder
2. Build the variant (it needs its own `index.html`)
3. Add the variant to the `"variants"` array in `prototypes.json`

---

## Duplicating a Prototype

Click the **copy icon** on any prototype card. This pre-fills the form with the original's info.

---

## Publishing Your Changes

```bash
git add .
git commit -m "Add my-feature prototype"
git push origin main
```

Changes go live on the hosted URL within a couple of minutes.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Prototype doesn't show on dashboard | Check your entry in `prototypes.json` — valid path to `index.html`? |
| Old version of someone's prototype | Run `git pull origin main` |
| Permission error when pushing | Ask repo admin to add you as a collaborator |
| Prototype looks broken | Use relative paths, not absolute (no leading `/`) |
| Want to start over | `git checkout -- .` then `git pull origin main` |
