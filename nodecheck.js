const fs = require('fs');
const env = JSON.parse(fs.readFileSync('/workspace/.gallop/preview-env.json','utf8')).backend;
process.env.DATABASE_URL = env.DATABASE_URL;
const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  const rows = await p.$queryRawUnsafe("select tablename from pg_tables where schemaname='public' order by 1");
  console.log('HOST:', env.APP_DB_HOST);
  console.log('TABLES:', rows.map(r => r.tablename).join(', '));
  for (const n of rows.map(r => r.tablename)) {
    const c = await p.$queryRawUnsafe(`select count(*)::int as n from "${n}"`);
    console.log('  ', n, '=', c[0].n, 'rows');
  }
  await p.$disconnect();
})().catch(e => console.log('ERR', e.message.split('\n')[0]));
