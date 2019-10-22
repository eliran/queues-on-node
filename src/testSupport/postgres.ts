import Knex = require('knex');
export const pg = Knex({
  client: 'pg',
  connection: 'postgresql://postgres:12345678@localhost:5432/postgres',
});
