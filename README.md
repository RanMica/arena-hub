# Arena

A shared platform for the Via product and design team to create, showcase, and test interactive prototypes with toggleable solution variants.

## Quick Start

```bash
git clone <repo-url>
cd Arena
npx serve .
# Open http://localhost:3000
```

## Team Guide

See **[GUIDE.md](GUIDE.md)** for the full team onboarding guide, or click **"How It Works"** in the hub dashboard.

## Project Structure

```
index.html            Hub dashboard
hub/
  hub.css             Hub styles
  hub.js              Hub logic
prototypes.json       Manifest (all prototypes + team roster)
prototypes/
  booking-agent/      Booking Agent prototype (copied from separate repo)
  ride-scheduling/    Demo scheduling prototype
  _base-template/     Starter template for new prototypes
GUIDE.md              Team onboarding guide
```

## Adding a Prototype

1. Add yourself to `team` in `prototypes.json` (once)
2. Click "New Prototype" in the dashboard and follow the instructions
3. Build your prototype in the generated folder
4. `git add . && git commit -m "Add prototype" && git push`

## Deployment (Cloudflare Pages + Access)

### One-time setup:

1. **Create a private GitHub repo** and push this code
2. **Cloudflare Pages** (free):
   - Sign up at [dash.cloudflare.com](https://dash.cloudflare.com)
   - Pages > Create a project > Connect to Git > select the repo
   - Build settings: leave blank (no build command, output = `/`)
   - Deploy — site goes live at `https://<project>.pages.dev`
3. **Cloudflare Access** (free, up to 50 users):
   - Zero Trust > Access > Applications > Add application
   - Type: Self-hosted, domain = your `*.pages.dev` URL
   - Policy: Allow > Include > Emails ending in `@ridewithvia.com`

### Cost: $0

Cloudflare Pages + Access free tier covers unlimited sites and up to 50 users.
