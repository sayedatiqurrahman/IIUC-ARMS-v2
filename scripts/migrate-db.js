#!/usr/bin/env node
/**
 * One-time data migration between CockroachDB clusters.
 * Copies every table (except UploadChunk, which only holds transient
 * staging bytes) from SOURCE_DATABASE_URL into DATABASE_URL.
 *
 * Usage:
 *   SOURCE_DATABASE_URL=<trial> DATABASE_URL=<new basic> node scripts/migrate-db.js
 */
require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const BATCH = 500;

async function main() {
  const srcUrl = process.env.SOURCE_DATABASE_URL;
  const dstUrl = process.env.DATABASE_URL;
  if (!srcUrl || !dstUrl) {
    console.error('Need both SOURCE_DATABASE_URL (trial) and DATABASE_URL (new cluster).');
    process.exit(1);
  }

  const src = new PrismaClient({ adapter: new PrismaPg({ connectionString: srcUrl }) });
  const dst = new PrismaClient({ adapter: new PrismaPg({ connectionString: dstUrl }) });

  // UploadChunk is intentionally omitted: it holds transient upload staging
  // bytes that are deleted right after each git commit; stale chunks are junk.
  const models = [
    'profile',
    'activityLog',
    'facultyMember',
    'course',
    'siteSettings',
    'semesterCourse',
    'publishedRoutine',
    'facultyRequest',
    'publishedExamRoutine',
    'room',
    'batch',
    'batchStudent',
    'telegramNotification',
  ];

  let total = 0;
  for (const name of models) {
    const rows = await src[name].findMany();
    const count = rows.length;
    console.log(`${name}: ${count} rows`);
    if (!count) continue;
    for (let i = 0; i < count; i += BATCH) {
      await dst[name].createMany({ data: rows.slice(i, i + BATCH) });
    }
    total += count;
  }

  console.log('\nVerifying destination...');
  for (const name of models) {
    const c = await dst[name].count();
    console.log(`  ${name}: ${c}`);
  }
  console.log(`\nCopied ${total} rows total.`);

  await src.$disconnect();
  await dst.$disconnect();
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
