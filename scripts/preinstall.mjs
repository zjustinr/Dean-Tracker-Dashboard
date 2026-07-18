// Runs before every install. Two jobs: clear npm/yarn lockfiles so they can't
// drift alongside pnpm-lock.yaml, and refuse installs driven by npm or yarn.
//
// This used to be an inline `sh -c '... case ... esac'` in package.json, which
// broke two ways on Windows: PowerShell has no `sh`, and under Git Bash the
// package manager wraps the script in another `sh -c`, so the outer shell
// expanded $npm_config_user_agent (a multi-word string) into the inner `case`
// and produced a syntax error. Node runs identically everywhere, and preinstall
// must not depend on node_modules -- hence builtins only.
import { rmSync } from "node:fs";

for (const f of ["package-lock.json", "yarn.lock"]) {
  rmSync(f, { force: true });
}

const ua = process.env.npm_config_user_agent ?? "";

// An absent user agent means some wrapper we don't recognise, not necessarily
// npm -- warn rather than hard-fail, since a wrong exit 1 here blocks every
// install including CI.
if (!ua) {
  console.warn("preinstall: no npm_config_user_agent set; skipping package-manager check.");
} else if (!ua.startsWith("pnpm/")) {
  console.error(`Use pnpm instead (detected: ${ua.split(" ")[0]}).`);
  console.error("Install it with `corepack enable pnpm`, then run `pnpm install`.");
  process.exit(1);
}
