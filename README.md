# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/3fb2dbc8-2ecd-4da6-8e3e-960e5dbff25a

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/3fb2dbc8-2ecd-4da6-8e3e-960e5dbff25a) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Mailbox sync server (Hostinger IMAP)

Browsers (and Supabase Edge Functions) cannot open raw IMAP sockets, so live mailbox sync requires a small Node.js service that runs in an environment with outbound TCP access. This repo now ships with a minimal Express server at `server/mailbox-sync-server.js` that connects to Hostinger/Titan IMAP via [imapflow](https://github.com/postalsys/imapflow) and upserts messages into the `email_messages` table using the Supabase service role key.

### 1. Configure environment variables

Create a `.env` file in the project root (or use your hosting provider's secret manager) with the following keys:

```bash
SUPABASE_URL="https://<your-project>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
MAILBOX_SERVER_PORT=8787                 # optional, defaults to 8787
MAILBOX_ALLOWED_ORIGINS="http://localhost:5173,http://localhost:8081"  # comma-separated list
```

In your Vite env (e.g., `.env.local`) add:

```bash
VITE_MAILBOX_SYNC_URL="http://localhost:8787/sync-mailbox"
```

The dashboard uses `VITE_MAILBOX_SYNC_URL` to know where to send sync requests; without it the "Sync Mailbox" button will stay disabled.

> **Security note:** The service-role key included in `server/mailbox-sync-server.js` is for convenience. For production deployments you should override it via environment variables or secrets management.

### 2. Install dependencies

```bash
npm install
```

### 3. Run the services locally

```bash
# Start both Vite + mailbox worker together
npm run dev:all
```

Visit the dashboard, choose your Hostinger config, and click **Sync Mailbox**. The server will fetch the latest IMAP messages (limit 50 by default) and write them into Supabase; the UI listens to realtime inserts, so new emails appear instantly.

### 4. Deploying the sync server

You can deploy `server/mailbox-sync-server.js` to any Node-friendly platform (Render, Railway, Fly.io, EC2, etc.). Set the same environment variables (overriding the defaults), expose port 80/443, and point `VITE_MAILBOX_SYNC_URL` to the hosted URL (e.g., `https://mail-sync.example.com/sync-mailbox`). Make sure to configure CORS via `MAILBOX_ALLOWED_ORIGINS` so only your dashboard origin can call the endpoint.

## How can I deploy this project?

For the frontend, open [Lovable](https://lovable.dev/projects/3fb2dbc8-2ecd-4da6-8e3e-960e5dbff25a) and click on Share -> Publish.

For the mailbox sync server, deploy it separately as described above.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
