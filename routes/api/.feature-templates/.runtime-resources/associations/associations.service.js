'use strict';

const associationsRepository = require('./associations.repository');
const { CrudService } = require('@shared/layers/crud.service');

class AssociationsService extends CrudService {

}

module.exports = new AssociationsService(associationsRepository);
