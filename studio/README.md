# Script Memorizor Studio

Sanity Studio for the Script Memorizor app.

## Project

- Sanity organization: Singularity
- Project ID: `p60eirei`
- Dataset: `production`
- Document type: `scriptSave`

## Commands

```sh
npm run dev
npm run build
```

The static app reads published `scriptSave` documents from Sanity. Uploads and deletes require a Sanity write token pasted into the app for the current browser session; no token is committed to this repository.

## Browser upload token

The Script Memorizor app can read public Sanity documents without a token. To upload, update, or delete saves from the browser app, create a Sanity API token with write access:

```sh
cd studio
sanity tokens add "Script Memorizor browser upload" --role=editor
```

Copy the token value when the CLI prints it. Sanity only shows the secret token once when it is created. Paste it into the app under **Sanity Database** -> **Write token** -> **Use Token**.

To check whether a token already exists, run:

```sh
cd studio
sanity tokens list
```

`sanity tokens list` shows token names and metadata, but it does not reveal the secret token value. If the value was lost, create a new token with `sanity tokens add` and use the new value.

Do not commit the token or put it in `netlify.toml`. The app stores it only in the current browser session.
