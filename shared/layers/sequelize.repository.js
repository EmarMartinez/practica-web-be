'use strict';

const { BaseSequelizeRepository } = require('./base/base-sequelize.repository');

class SequelizeRepository extends BaseSequelizeRepository {

}

exports.SequelizeRepository = SequelizeRepository;
exports.createRepository = (model) => new SequelizeRepository(model);
