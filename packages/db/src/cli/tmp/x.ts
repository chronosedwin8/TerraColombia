import { execute } from '../../pool.js';
import { sql } from '../../sql.js';
import { loadEnv } from '../../env.js';

const ORG = 'ba50da95-674d-4c42-851e-1729dffc1643';

async function main() {
  loadEnv();
  const a = await execute(sql`UPDATE app.subscription SET plan_code='business' WHERE organization_id = ${ORG}::uuid RETURNING id, plan_code`);
  console.log('sub', JSON.stringify(a));
  const b = await execute(sql`INSERT INTO app.credit_ledger (id, organization_id, delta, reason, created_at) VALUES (gen_random_uuid(), ${ORG}::uuid, 2000, 'adjustment', now()) RETURNING id`);
  console.log('credits', JSON.stringify(b));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
