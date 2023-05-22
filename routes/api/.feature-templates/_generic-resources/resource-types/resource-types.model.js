'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('@config/sequelize.config');
const { isMultitenantEnabled } = require('@config');
const { notNull } = require('@config/validations.config');
require('./resource-type-properties.model');

const options = {};

if (isMultitenantEnabled) {
  options.schema = 'admin';
}

const ResourceTypesModel = sequelize.define(
  'resourceType',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false, validate: { notNull } },
    name: { type: DataTypes.STRING, allowNull: false, validate: { notNull } }
  },
  options
);

ResourceTypesModel.associate = function () {
  const model = modelName => this.sequelize.model(modelName);

  this.belongsToMany(model('property'), { through: model('resourceTypeProperty') });
  console.debug('ResourceType belongs to many Properties through ResourceTypeProperties');
};

module.exports = ResourceTypesModel;
