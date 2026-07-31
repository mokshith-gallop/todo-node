const fs = require('fs');
const env = JSON.parse(fs.readFileSync('/workspace/.gallop/preview-env.json','utf8')).backend;
process.env.DATABASE_URL = env.DATABASE_URL;
const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  for (const t of ['user','task_list','task']) {
    const r = await p.$queryRawUnsafe(
      `select count(*)::int as n, min(created_at) as first, max(created_at) as last from "${t}"`);
    console.log(t.padEnd(10), 'n=' + r[0].n, '| first:', r[0].first, '| last:', r[0].last);
  }
  await p.$disconnect();
})().catch(e => console.log('ERR', e.message.split('\n')[0]));
