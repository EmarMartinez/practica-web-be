'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('@config/sequelize.config');
const { isMultitenantEnabled } = require('@config');
const { notNull } = require('@config/validations.config');

const ResourcePropertiesModel = sequelize.define(
  'resourceProperty',
  {
    value: { type: DataTypes.STRING, allowNull: false, validate: { notNull } }
  },
  {}
);

if (isMultitenantEnabled) {
  ResourcePropertiesModel.associate = function () {
    const model = modelName => this.sequelize.model(modelName);

    //* Super many-to-many associations for multitenancy
    //* Defined to make work properly many-to-many association between schemas
    //* (model 'property' belongs to 'admin' schema)

    this.belongsTo(model('resource'));
    console.debug('ResourceProperty belongs to Resource');

    this.belongsTo(model('property'));
    console.debug('ResourceProperty belongs to Property');
  };
}

module.exports = ResourcesModel;
