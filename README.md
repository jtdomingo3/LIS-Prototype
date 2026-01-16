# LIS Prototype

A Laboratory Information System (LIS) prototype — full-stack Node.js/Express app and UI.

This repository contains a working prototype app in the `lis-fullstack` folder.

Quick start

1. Open a terminal and change to the application folder:

```powershell
cd "lis-fullstack"
```

2. Install dependencies:

```powershell
npm install
```

3. (Optional) Seed sample data:

```powershell
node seed.js
```

4. Start the app:

```powershell
npm start
```

5. Open http://localhost:3000 in your browser.

Notes

- The main app is in `lis-fullstack/` (see `lis-fullstack/package.json` for scripts).
- `node_modules/` and the `sample results/` folder are ignored by `.gitignore` to keep the repo clean.
- If `node_modules` or `sample results` were previously committed, run the git removal commands shown in `.gitignore` task notes.

Project layout (high level)

- `lis-fullstack/` — application code
  - `models/`, `routes/`, `views/`, `middleware/`, `assets/`
  - `server.js`, `seed.js`, `data.json`

If you want, I can commit this `README.md` and run the recommended `git rm --cached` commands to remove already-tracked folders.