const sinon = require('sinon');
const { sequelize } = require('../../support');

module.exports.stubQueryRun = function stubQueryRun() {
  let lastExecutedSql;

  class FakeQuery {
    run(sql) {
      lastExecutedSql = sql;

      return Promise.resolve([]);
    }
  }

  // Restore existing stubs if they exist
  if (sequelize.dialect.Query && sequelize.dialect.Query.restore) {
    sequelize.dialect.Query.restore();
  }
  if (sequelize.connectionManager.getConnection && sequelize.connectionManager.getConnection.restore) {
    sequelize.connectionManager.getConnection.restore();
  }
  if (sequelize.connectionManager.releaseConnection && sequelize.connectionManager.releaseConnection.restore) {
    sequelize.connectionManager.releaseConnection.restore();
  }

  const stubs = [
    sinon.stub(sequelize.dialect, 'Query').get(() => FakeQuery),
    sinon.stub(sequelize.connectionManager, 'getConnection').returns({}),
    sinon.stub(sequelize.connectionManager, 'releaseConnection')
  ];

  const getSql = () => {
    return lastExecutedSql;
  };

  getSql.restore = () => {
    stubs.forEach(stub => {
      if (stub && stub.restore) {
        stub.restore();
      }
    });
  };

  return getSql;
};