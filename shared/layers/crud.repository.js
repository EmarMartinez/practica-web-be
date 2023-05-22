'use strict';

const { SequelizeRepository } = require('./sequelize.repository');

class CrudRepository extends SequelizeRepository { }

exports.CrudRepository = CrudRepository;
exports.createRepository = (model) => new CrudRepository(model);
