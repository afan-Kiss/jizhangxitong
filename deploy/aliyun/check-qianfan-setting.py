#!/usr/bin/env python3
from pathlib import Path
import paramiko
pwd = next(l.split('=',1)[1].strip().strip('"').strip("'") for l in Path('secrets/deploy.env').read_text(encoding='utf-8').splitlines() if l.strip().startswith('SSH_PASS='))
c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect('8.137.126.18',username='root',password=pwd,timeout=60)
db='/www/wwwroot/jade-accounting/apps/server/prisma/data/accounting.db'
cmd=f'''python3 - <<'PY'
import sqlite3
con=sqlite3.connect("{db}")
for row in con.execute("select key,value from SystemSetting where key like '%qianfan%' or key like '%Qianfan%'"):
    print(row)
PY'''
_,o,e=c.exec_command(cmd,timeout=30)
print((o.read()+e.read()).decode('utf-8','replace'))
c.close()
