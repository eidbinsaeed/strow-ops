#!/usr/bin/env node
/**
 * One-time helper: get a Google Drive refresh token for Strow Ops.
 *
 * Usage:
 *   1. Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in your env
 *      (or paste them when prompted).
 *   2. Run:  node scripts/get-drive-refresh-token.mjs
 *   3. Open the URL it prints in a browser, sign in to the Google account
 *      that owns the /Strow folder, accept the consent screen.
 *   4. Google redirects to http://localhost:53682 with ?code=... in the URL.
 *      The script captures the code, exchanges it, and prints the
 *      GOOGLE_DRIVE_REFRESH_TOKEN to copy into Vercel + .env.local.
 *
 * Required OAuth client config in Google Cloud Console:
 *   - Application type: Web application
 *   - Authorized redirect URIs: http://localhost:53682
 */
import http from "node:http";
import { URL } from "node:url";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { google } from "googleapis";

const REDIRECT_URI = "http://localhost:53682";
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

async function prompt(label, fallback) {
  if (fallback) return fallback;
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const value = await rl.question(`${label}: `);
  rl.close();
  return value.trim();
}

const clientId = await prompt(
  "GOOGLE_DRIVE_CLIENT_ID",
  process.env.GOOGLE_DRIVE_CLIENT_ID,
);
const clientSecret = await prompt(
  "GOOGLE_DRIVE_CLIENT_SECRET",
  process.env.GOOGLE_DRIVE_CLIENT_SECRET,
);

if (!clientId || !clientSecret) {
  console.error("Both GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET are required.");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // force a refresh_token even if already granted
  scope: SCOPES,
});

console.log("\n1. Open this URL in your browser:\n");
console.log(authUrl);
console.log("\n2. Sign in and click Allow. The browser will land on http://localhost:53682.\n3. The script will capture the code and exchange it for a refresh token.\n");

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", REDIRECT_URI);
    const c = u.searchParams.get("code");
    const err = u.searchParams.get("error");
    if (err) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end(`Auth error: ${err}. Close this tab and try again.`);
      server.close();
      reject(new Error(err));
      return;
    }
    if (!c) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("No code in URL.");
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Got the code. You can close this tab.");
    server.close();
    resolve(c);
  });
  server.listen(53682, "127.0.0.1");
});

const { tokens } = await oauth2.getToken(code);

if (!tokens.refresh_token) {
  console.error("\nNo refresh_token returned. Try re-running - the OAuth client may need access_type=offline + prompt=consent (already set), and the client must be type 'Web application'.");
  process.exit(1);
}

console.log("\nSUCCESS. Add this to Vercel env vars and your local .env.local:\n");
console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);
console.log("\nThen also set GOOGLE_DRIVE_ROOT_FOLDER_ID to the Drive folder id of /Strow (visible in the URL when you open the folder in drive.google.com).");
