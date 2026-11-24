#!/usr/bin/env node
// Generates docs/API_ROUTE_AUDIT.md from src/app/api route handlers.
// Run: npm run audit:api-routes
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const apiRoot = path.join(root, "src/app/api");

function inferDomain(routePath) {
  const p = routePath.replace(/^\/api\//, "");
  if (p.startsWith("auth")) return "identity";
  if (p.startsWith("members")) return "members";
  if (p.startsWith("plans") || p.startsWith("renewals")) return "memberships";
  if (p.startsWith("payments")) return "payments";
  if (p.startsWith("attendance")) return "attendance";
  if (
    p.startsWith("whatsapp") ||
    p.startsWith("reminders") ||
    p.includes("send-reminder") ||
    p.includes("send-bulk")
  ) {
    return "communications";
  }
  if (p.startsWith("bills")) return "billing";
  if (p.startsWith("expenses") || p.startsWith("salaries")) return "finance";
  if (p.startsWith("trainers")) return "trainers";
  if (p.startsWith("challenges") || p.startsWith("leaderboard")) return "engagement";
  if (p.startsWith("workouts")) return "workouts";
  if (p.startsWith("overdue")) return "collections";
  if (p.startsWith("analytics") || p.startsWith("dashboard")) return "analytics";
  if (p.startsWith("cron") || p.startsWith("inngest")) return "platform-jobs";
  if (p.startsWith("health") || p.startsWith("validate")) return "platform";
  if (p.startsWith("gyms") || p.startsWith("gym-context")) return "tenancy";
  if (p.startsWith("users") || p.startsWith("settings") || p.startsWith("audit")) {
    return "admin";
  }
  return "platform";
}

function scanFile(absPath) {
  const content = fs.readFileSync(absPath, "utf8");
  const usesPrisma =
    /@\/lib\/prisma/.test(content) || /from ['"]@prisma\/client['"]/.test(content);
  const usesDomain = /@\/domains\//.test(content);
  const rel = path.relative(path.join(root, "src/app"), absPath).replace(/\\/g, "/");
  const routePath = "/" + rel.replace(/\/route\.ts$/, "");
  return {
    routePath,
    domain: inferDomain(routePath),
    usesPrisma,
    usesDomain,
    status: usesDomain && !usesPrisma ? "migrated" : usesDomain ? "partial" : "direct-prisma",
  };
}

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (name === "route.ts") acc.push(full);
  }
  return acc;
}

const rows = walk(apiRoot).map(scanFile).sort((a, b) => (a.routePath < b.routePath ? -1 : a.routePath > b.routePath ? 1 : 0));

const migrated = rows.filter((r) => r.status === "migrated").length;
const partial = rows.filter((r) => r.status === "partial").length;
const direct = rows.filter((r) => r.status === "direct-prisma").length;

const lines = [
  "# API route audit",
  "",
  "Auto-generated route inventory (`npm run audit:api-routes`). Regenerate after API changes.",
  "Output is deterministic (no timestamps) so CI can detect staleness by exact comparison.",
  "",
  `**Routes:** ${rows.length} · **Migrated:** ${migrated} · **Partial:** ${partial} · **Direct Prisma:** ${direct}`,
  "",
  "Regenerate: `npm run audit:api-routes`",
  "",
  "| Route | Domain | Prisma in route | Domain import | Status |",
  "|-------|--------|-----------------|---------------|--------|",
  ...rows.map(
    (r) =>
      `| \`${r.routePath}\` | ${r.domain} | ${r.usesPrisma ? "yes" : "no"} | ${r.usesDomain ? "yes" : "no"} | ${r.status} |`
  ),
  "",
  "## M0.3 priority (next 15)",
  "",
  "1. `/api/plans` GET — done",
  "2. `/api/members` GET — done (`listMembersHandler` + API mapper)",
  "3. `/api/payments` GET — done (full list + stats DTO)",
  "4. `/api/renewals/reminder-candidates` — done (gym-scoped)",
  "5. `/api/attendance` POST — done (`recordAttendanceHandler`)",
  "6. `/api/whatsapp/send` POST — done (`sendWhatsAppHandler`)",
  "7. `/api/members/[id]` GET — done (`getMemberApiDetail`)",
  "8. `/api/attendance` GET — done (gym-scoped list)",
  "9. `/api/attendance/qr` GET+POST — done",
  "10. `/api/reminders/history` — done (gym-scoped ReminderLog)",
  "11. `/api/reminders/unpaid` — done (gym-scoped)",
  "12. `/api/members` POST — done (`admitMemberHandler`)",
  "13. `/api/payments` POST — done (`createPaymentHandler`)",
  "14. `/api/plans/[id]` PUT/DELETE — done (gym-scoped)",
  "15. `/api/payments/quick-entry` — logic in `domains/payments/services`",
  "",
  "## Next batch",
  "",
  "1. `/api/overdue/list` — collections domain",
  "2. `/api/analytics/summary` — analytics worker prep",
  "3. `/api/members/[id]` PUT — `updateMemberHandler`",
  "4. `/api/payments/[id]` PATCH/DELETE",
  "5. `/api/plans` POST — create plan command",
  "",
];

const outPath = path.join(root, "docs/API_ROUTE_AUDIT.md");
fs.writeFileSync(outPath, lines.join("\n"));
console.log(`Wrote ${outPath} (${rows.length} routes)`);
