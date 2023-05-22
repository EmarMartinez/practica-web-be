'use strict';

const { SequelizeRepository } = require('./sequelize.repository');

class BaseCrudRepository extends SequelizeRepository {}

exports.BaseCrudRepository = BaseCrudRepository;
exports.createRepository = (model) => new BaseCrudRepository(model);
