const DataTypes = require('../../../lib/data-types');
const sinon = require('sinon');
const { expectsql, sequelize } = require('../../support');
const { stubQueryRun } = require('./stub-query-run');

describe('QueryInterface#delete', () => {
  const User = sequelize.define('User', {
    firstName: DataTypes.STRING
  }, { timestamps: false });

  let getSql;

  afterEach(() => {
    if (getSql && getSql.restore) {
      getSql.restore();
    }
  });

  // you'll find more replacement tests in query-generator tests
  it('does not parse replacements outside of raw sql', async () => {
    getSql = stubQueryRun();
    const instance = new User();

    await sequelize.getQueryInterface().delete(
      instance,
      User.tableName,
      { id: ':id' },
      {
        replacements: {
          limit: 1,
          id: '123'
        }
      }
    );

    expectsql(getSql(), {
      default: 'DELETE FROM [Users] WHERE [id] = \':id\'',
      postgres: 'DELETE FROM "Users" WHERE "id" IN (SELECT "id" FROM "Users" WHERE "id" = \':id\' LIMIT 1)',
      mssql: 'DELETE FROM [Users] WHERE [id] = N\':id\'; SELECT @@ROWCOUNT AS AFFECTEDROWS;',
      snowflake: 'DELETE FROM "Users" WHERE "id" = \':id\';'
    });
  });
});