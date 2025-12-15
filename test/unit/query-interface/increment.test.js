const DataTypes = require('../../../lib/data-types');
const sinon = require('sinon');
const { expectsql, sequelize } = require('../../support');
const { stubQueryRun } = require('./stub-query-run');

describe('QueryInterface#increment', () => {
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
    const getSql = stubQueryRun();

    await sequelize.getQueryInterface().increment(
      User,
      User.tableName,
      // incrementAmountsByField
      { age: ':age' },
      // where
      { id: ':id' },
      // options
      {
        attributes: { name: ':name' },
        returning: [':data'],
        replacements: {
          age: 1,
          id: 2,
          data: 3
        }
      }
    );

    expectsql(getSql(), {
      default: 'UPDATE [Users] SET [age]=[age]+ \':age\',[name]=\':name\' WHERE [id] = \':id\'',
      postgres: 'UPDATE "Users" SET "age"="age"+ \':age\',"name"=\':name\' WHERE "id" = \':id\' RETURNING *',
      mssql: 'UPDATE [Users] SET [age]=[age]+ N\':age\',[name]=N\':name\' OUTPUT INSERTED.[:data] WHERE [id] = N\':id\''
    });
  });
});