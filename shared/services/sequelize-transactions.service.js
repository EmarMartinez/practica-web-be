'use strict';

const { randomBytes } = require('crypto');
const sequelize = require('@config/sequelize.config');

class SequelizeTransactionsService {

  constructor() {
    this.sequelize = sequelize;
    this.randomBytes = randomBytes;
    this.transactions = {};
  }

  async start() {
    const id = this.randomBytes(100)
      .toString('base64')
      .replace(/[/+=]/g, '')
      .slice(0, 10);
    const transaction = await this.sequelize.transaction();
    this.transactions[id] = transaction;
    return id;
  }

  async commit(id) {
    await this.transactions[id].commit();
    delete this.transactions[id];
  }

  async rollback(id) {
    await this.transactions[id].rollback();
    delete this.transactions[id];
  }

  get(id) {
    return this.transactions[id];
  }

}

module.exports = new SequelizeTransactionsService();
