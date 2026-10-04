import { getDatabaseClient, disconnectDatabase } from "../db/client";
import { lockAccountAdministration } from "../repositories/adminRepository";
import { AuditLogService } from "../services/auditLogService";
import { AuditEventType, AuditActorType } from "../audit/events";

async function run() {
  const identifier = process.argv[2]?.trim();
  if (!identifier || process.argv.length !== 3)
    throw new Error("Usage: npm run -w server admin:promote -- <username-or-email>");
  const id = await getDatabaseClient().$transaction(async (tx) => {
    await lockAccountAdministration(tx);
    const users = await tx.user.findMany({
      where: { OR: [{ email: identifier.toLowerCase() }, { profile: { username: identifier } }] },
      select: { id: true, blockedAt: true, role: true },
      take: 2,
    });
    if (users.length !== 1)
      throw new Error("Identifier must resolve to exactly one existing account");
    if (users[0].blockedAt) throw new Error("Unblock this account before promotion");
    await tx.user.update({ where: { id: users[0].id }, data: { role: "ADMIN" } });
    if (users[0].role !== "ADMIN")
      await new AuditLogService().record(tx, {
        eventType: AuditEventType.USER_ROLE_CHANGED,
        actor: { type: AuditActorType.SYSTEM },
        targetUserId: users[0].id,
        metadata: { previousRole: users[0].role, newRole: "ADMIN" },
        reason: "Operator CLI admin promotion",
      });
    return users[0].id;
  });
  console.log(`ADMIN role assigned to account ${id}`);
}
void run()
  .catch((error) => {
    // Never print DB diagnostics, connection URLs, passwords or tokens.
    console.error(
      error instanceof Error &&
        ["Usage:", "Identifier", "Unblock"].some((prefix) => error.message.startsWith(prefix))
        ? error.message
        : "Admin promotion failed; check database configuration",
    );
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
