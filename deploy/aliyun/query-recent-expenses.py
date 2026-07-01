#!/usr/bin/env python3
"""Query recent expenses on production server."""
from pathlib import Path
import paramiko

HOST = "8.137.126.18"
DB = "/www/wwwroot/jade-accounting/apps/server/prisma/data/accounting.db"


def load_password() -> str:
    for line in (Path(__file__).resolve().parents[2] / "secrets" / "deploy.env").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("SSH_PASS="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def run(c, cmd):
    _, o, e = c.exec_command(cmd, timeout=60)
    return (o.read() + e.read()).decode("utf-8", "replace").strip()


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=load_password(), timeout=60)

    print("=== server time ===")
    print(run(c, "date"))

    print("=== DATABASE_URL ===")
    print(run(c, "grep DATABASE_URL /www/wwwroot/jade-accounting/apps/server/.env 2>/dev/null || echo missing"))

    print("\n=== db file ===")
    print(run(c, f"ls -la {DB} 2>&1; find /www/wwwroot/jade-accounting -name 'accounting.db*' -ls 2>/dev/null | head -20"))

    print("\n=== backups ===")
    print(run(c, "ls -lt /www/wwwroot/jade-accounting/backups 2>/dev/null | head -10; ls -lt /www/backup 2>/dev/null | head -5; ls -lt /root 2>/dev/null | grep -i jade | head -5"))

    print("\n=== pm2 logs tail ===")
    print(run(c, "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 logs jade-accounting-server --lines 30 --nostream 2>&1 | tail -40"))

    print("\n=== sqlite tables ===")
    print(run(c, f"sqlite3 {DB} \".tables\""))

    print("\n=== counts ===")
    print(run(c, f"""sqlite3 -header -column {DB} "SELECT 'Expense' as t, count(*) as c FROM Expense UNION ALL SELECT 'User', count(*) FROM User UNION ALL SELECT 'Sale', count(*) FROM Sale UNION ALL SELECT 'File', count(*) FROM File;" """))

    print("\n=== all expenses (raw) ===")
    print(run(c, f"""sqlite3 {DB} "SELECT * FROM Expense;" """))

    print("\n=== wal checkpoint + recount ===")
    print(run(c, f"""sqlite3 {DB} "PRAGMA wal_checkpoint(FULL); SELECT count(*) FROM Expense;" """))

    print("\n=== expense 373 detail ===")
    print(run(c, f"""sqlite3 -header -column {DB} "SELECT id, expenseNo, amount, paySource, reimbursementStatus, businessType, datetime(occurredAt/1000,'unixepoch','localtime') as occurred, datetime(createdAt/1000,'unixepoch','localtime') as created, isVoided, voidReason, createdBy FROM Expense WHERE id=373;" """))

    print("\n=== older backups ===")
    print(run(c, "ls -lt /www/backup | grep jade-accounting | head -10"))
    bak124 = "/www/backup/jade-accounting-20260701-124725/apps/server/prisma/data/accounting.db"
    print("\n=== backup 124725 expense 376 (user noon?) ===")
    print(run(c, f"""sqlite3 -header -column {bak124} "SELECT id, expenseNo, amount, paySource, reimbursementStatus, businessType, expenseType, datetime(occurredAt/1000,'unixepoch','localtime') as occurred, datetime(createdAt/1000,'unixepoch','localtime') as created, isVoided, createdBy FROM Expense WHERE id=376;" """))
    print(run(c, f"""sqlite3 -header -column {bak124} "SELECT id, username, name FROM User;" """))
    print(run(c, f"""sqlite3 -header -column {bak124} "SELECT id, module, action, targetType, targetId, datetime(createdAt/1000,'unixepoch','localtime') FROM OperationLog WHERE module='expense' ORDER BY createdAt DESC LIMIT 10;" """))

    print("\n=== operation logs recent ===")
    print(run(c, f"""sqlite3 -header -column {DB} "SELECT id, module, action, targetType, targetId, createdAt FROM OperationLog ORDER BY createdAt DESC LIMIT 20;" """))
    print(run(c, f"""sqlite3 -header -column {DB} "SELECT id, expenseNo, amount, paySource, reimbursementStatus, businessType, occurredAt, createdAt, createdBy FROM Expense WHERE date(occurredAt) = date('now', 'localtime') AND isVoided = 0 AND isTrialRun = 0 ORDER BY createdAt DESC LIMIT 20;" """))

    print("\n=== created 11:00-14:00 local today ===")
    print(run(c, f"""sqlite3 -header -column {DB} "SELECT id, expenseNo, amount, paySource, reimbursementStatus, businessType, occurredAt, createdAt FROM Expense WHERE date(createdAt) = date('now', 'localtime') AND time(createdAt) >= '11:00:00' AND time(createdAt) <= '14:00:00' AND isVoided = 0 ORDER BY createdAt DESC;" """))

    print("\n=== last 15 created ===")
    print(run(c, f"""sqlite3 -header -column {DB} "SELECT id, expenseNo, amount, paySource, reimbursementStatus, businessType, occurredAt, createdAt FROM Expense WHERE isVoided = 0 ORDER BY createdAt DESC LIMIT 15;" """))

    print("\n=== reimbursement list filter simulation (today + 员工垫付 + pending) ===")
    print(run(c, f"""sqlite3 -header -column {DB} "SELECT id, expenseNo, amount, paySource, reimbursementStatus, occurredAt, createdAt FROM Expense WHERE isVoided = 0 AND isTrialRun = 0 AND paySource = '员工垫付' AND reimbursementStatus = 'pending' AND date(occurredAt) = date('now', 'localtime') ORDER BY occurredAt DESC;" """))

    print("\n=== today but NOT in reimbursement filter ===")
    print(run(c, f"""sqlite3 -header -column {DB} "SELECT id, expenseNo, amount, paySource, reimbursementStatus, occurredAt, createdAt FROM Expense WHERE isVoided = 0 AND isTrialRun = 0 AND date(occurredAt) = date('now', 'localtime') AND NOT (paySource = '员工垫付' AND reimbursementStatus = 'pending') ORDER BY createdAt DESC;" """))

    c.close()


if __name__ == "__main__":
    main()
