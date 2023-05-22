'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('@config/sequelize.config');
const { isMultitenantEnabled } = require('@config');
const { notNull, setIsIn } = require('@config/validations.config');
const isIn = setIsIn(['string', 'integer', 'float', 'boolean', 'date']);

const options = {};

if (isMultitenantEnabled) {
  options.schema = 'admin';
}

const PropertiesModel = sequelize.define(
  'property',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false, validate: { notNull } },
    name: { type: DataTypes.STRING, allowNull: false, validate: { notNull } },
    field: { type: DataTypes.STRING, allowNull: false, validate: { notNull } },
    type: { type: DataTypes.STRING, allowNull: false, validate: { notNull, isIn } },
    units: { type: DataTypes.STRING },
    allowNull: { type: DataTypes.BOOLEAN, allowNull: false, validate: { notNull } },
    // TODO: Not allow null for resourceId by using Sequelize built-in nested entities creation
    // resourceId: { type: DataTypes.INTEGER, allowNull: false, validate: { notNull } }
  },
  options
);

PropertiesModel.associate = function () {
  const model = modelName => this.sequelize.model(modelName);

  this.belongsTo(model('resource'));
  console.debug('Property belongs to Resource');
};

module.exports = PropertiesModel;
