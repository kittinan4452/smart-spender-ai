// Sends a Discord notification when a Vercel deploy starts.
// Wired into the `build` script (runs at the start of every Vercel build).
// Fail-safe: never blocks the build. Skips silently when no webhook URL is set
// (e.g. local `npm run build`).

const webhook = process.env.DISCORD_DEPLOY_WEBHOOK;

if (!webhook) {
  // No webhook configured (local build or not set on Vercel) — skip quietly.
  process.exit(0);
}

// Vercel injects these system env vars during the build step.
// https://vercel.com/docs/environment-variables/system-environment-variables
const env = process.env.VERCEL_ENV ?? "development";
const ref = process.env.VERCEL_GIT_COMMIT_REF ?? "local";
const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
const shortSha = sha.slice(0, 7) || "unknown";
const author = process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME ?? "unknown";
const rawMessage = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "(no message)";
const message = rawMessage.split("\n")[0].slice(0, 200);
const repoSlug = process.env.VERCEL_GIT_REPO_SLUG ?? "smart-spender-ai";
const repoOwner = process.env.VERCEL_GIT_REPO_OWNER ?? "";
const url = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;

const commitUrl =
  repoOwner && sha
    ? `https://github.com/${repoOwner}/${repoSlug}/commit/${sha}`
    : null;

// Green for production, orange for preview/others.
const color = env === "production" ? 0x2ecc71 : 0xe67e22;

const fields = [
  { name: "Environment", value: `\`${env}\``, inline: true },
  { name: "Branch", value: `\`${ref}\``, inline: true },
  {
    name: "Commit",
    value: commitUrl ? `[\`${shortSha}\`](${commitUrl})` : `\`${shortSha}\``,
    inline: true,
  },
  { name: "Author", value: author, inline: true },
  { name: "Message", value: message, inline: false },
];

if (url) {
  fields.push({ name: "Preview URL", value: url, inline: false });
}

const payload = {
  username: "Vercel Deploy",
  embeds: [
    {
      title: "🚀 Deploy started — smart-spender-ai",
      color,
      fields,
      timestamp: new Date().toISOString(),
    },
  ],
};

try {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.warn(
      `[notify-deploy] Discord webhook returned ${res.status} ${res.statusText}`,
    );
  } else {
    console.log("[notify-deploy] Discord notification sent.");
  }
} catch (err) {
  // Network hiccup shouldn't fail the deploy.
  console.warn("[notify-deploy] Failed to send Discord notification:", err);
}

process.exit(0);
