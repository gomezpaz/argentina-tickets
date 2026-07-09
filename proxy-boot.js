// Route Node's built-in fetch() through the environment's egress proxy.
//
// In the Claude Code web/remote environment, direct egress is blocked by a
// network allowlist (plain fetch gets 403 "Host not in allowlist: <host>").
// Reaching the ticket sites requires going through the policy proxy at
// $HTTPS_PROXY. But Node's built-in fetch ignores HTTPS_PROXY unless
// NODE_USE_ENV_PROXY=1 is set — and that is only read at process startup, so
// it can't be set from inside the script. We therefore re-exec the entry
// script once with the flag enabled. NODE_EXTRA_CA_CERTS (already set in this
// environment) makes the proxy's re-terminated TLS trusted.
//
// No-ops when there is no proxy (e.g. running locally with direct internet)
// or when the flag is already set, so it's safe everywhere.
if (
  !process.env.NODE_USE_ENV_PROXY &&
  (process.env.HTTPS_PROXY || process.env.https_proxy)
) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [process.argv[1], ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(r.status == null ? 1 : r.status);
}

module.exports = {};
