import { pg } from 'src/testSupport/postgres';

(async () => {
  try {
    await waitForPostgresBoot();
    run();
    beforeEach(async () => {
      await clearDatabase();
    });
    after(async () => {
      await pg.destroy();
    });
  } catch (e) {
    console.log('Something went wrong initializing test', e);
    await pg.destroy();
  }
})();

async function waitForPostgresBoot(): Promise<void> {
  await clearDatabase();
}

async function clearDatabase(): Promise<void> {
  await pg.raw('DROP SCHEMA public CASCADE');
  await pg.raw('CREATE SCHEMA public');
  await pg.raw('GRANT ALL ON SCHEMA public TO postgres');
  await pg.raw('GRANT ALL ON SCHEMA public TO public');
}
