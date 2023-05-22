'use strict';

const UsersModel = require('./users.model');
const { CrudRepository } = require('@shared/layers/crud.repository');

class UsersRepository extends CrudRepository {
  
}

module.exports = new UsersRepository(UsersModel);
