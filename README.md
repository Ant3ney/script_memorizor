# Script Memorizor

Script Memorizor stores a library of scripts under a four-digit save ID. The browser keeps a local copy for fast editing, while Netlify Functions read and write the library in MongoDB Atlas.

## Run locally

1. Install the Netlify CLI if it is not already available: `npm install --global netlify-cli`.
2. Copy `.env.example` to `.env` and put the MongoDB Atlas connection string in `MONGODB_URI`.
3. Install dependencies and start Netlify's local environment:

   ```sh
   npm install
   npm run dev
   ```

4. Open the local URL printed by Netlify, normally <http://localhost:8888>.

Do not open `index.html` directly: Atlas access goes through Netlify Functions so database credentials never enter browser code.

## Four-digit saves

- **Save to ID** writes the complete local script library to that ID and enables automatic cloud saves.
- **Load ID** replaces the browser's local library with the scripts currently stored under that ID.
- After a successful save or load, the active ID is remembered in local storage, restored after a browser restart, and synced every 30 seconds in addition to immediate saves after changes.
- **Disconnect** flushes pending changes and removes the remembered ID from that browser.
- Leading zeroes are supported, so `0042` is a valid ID.

A four-digit ID has only 10,000 possible values. Treat this as convenient shared storage, not private or authenticated storage; anyone who knows or guesses an ID can read and replace its scripts.

## Netlify deployment

Connect this repository to the Netlify site and use the repository root as the base directory. `netlify.toml` publishes `public/` and deploys the functions in `netlify/functions/`.

In **Project configuration → Environment variables**, add:

- `MONGODB_URI` — the complete Atlas connection string.
- `MONGODB_DB_NAME` — `script_memorizor`.

If the Netlify plan supports scoped secret variables, mark `MONGODB_URI` as secret and limit it to Functions. Otherwise, use the default site environment-variable settings; the value remains server-side but can be viewed by authorized Netlify team members.

Redeploy after changing an environment variable. Do not put the Atlas password in `netlify.toml` or browser code. The Atlas network-access list must also allow connections from the Netlify function runtime.
