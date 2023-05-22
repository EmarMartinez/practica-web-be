'use strict';

const propertiesRepository = require('./properties.repository');
const { CrudService } = require('@shared/layers/crud.service');

class PropertiesService extends CrudService {

}

module.exports = new PropertiesService(propertiesRepository);
