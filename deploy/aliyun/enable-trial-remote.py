#!/usr/bin/env python3
import os
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
PASSWORD = os.environ.get("SSH_PASS", "")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASSWORD, timeout=60)

script = r"""
cd /www/wwwroot/jade-accounting/apps/server
node <<'NODE'
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.systemSetting.upsert({
  where: { settingKey: 'trial_mode_enabled' },
  create: { settingKey: 'trial_mode_enabled', settingValue: 'true', valueType: 'string' },
  update: { settingValue: 'true' },
}).then(() => p.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
NODE
"""

_, o, e = c.exec_command(script, timeout=60)
print(o.read().decode("utf-8", "replace"))
err = e.read().decode("utf-8", "replace")
if err.strip():
    print(err)
c.close()
