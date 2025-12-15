const DataTypes = require('../../../lib/data-types');
const sinon = require('sinon');
const { expectsql, sequelize } = require('../../support');
const { stubQueryRun } = require('./stub-query-run');

describe('QueryInterface#rawSelect', () => {
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
  it('does not parse user-provided data as replacements', async () => {
    getSql = stubQueryRun();

    await sequelize.getQueryInterface().rawSelect(User.tableName, {
      // @ts-expect-error -- we'll fix the typings when we migrate query-generator to TypeScript
      attributes: ['id'],
      where: {
        username: 'some :data'
      },
      replacements: {
        data: 'OR \' = '
      }
    }, 'id', User);

    expectsql(getSql(), {
      default: 'SELECT [id] FROM [Users] AS [User] WHERE [User].[username] = \'some :data\';',
      mssql: 'SELECT [id] FROM [Users] AS [User] WHERE [User].[username] = N\'some :data\';'
    });
  });
});