'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('@config/sequelize.config');
const { isMultitenantEnabled } = require('@config');
const { notNull, isInt, setIsIn } = require('@config/validations.config');
const isIn = setIsIn(['hasOne', 'hasMany', 'belongsTo', 'belongsToMany']);

const options = {};

if (isMultitenantEnabled) {
  options.schema = 'admin';
}

const AssociationsModel = sequelize.define(
  'association',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false, validate: { notNull, isInt } },
    type: { type: DataTypes.STRING, allowNull: false, validate: { notNull, isIn } },
    targetId: { type: DataTypes.INTEGER, allowNull: false, validate: { notNull } },
    // TODO: Not allow null for resourceId by using Sequelize built-in nested entities creation
    // resourceId: { type: DataTypes.INTEGER, allowNull: false, validate: { notNull } }
  },
  options
);

AssociationsModel.associate = function () {
  const model = modelName => this.sequelize.model(modelName);

  this.belongsTo(model('resource'));
  console.debug('Association belongs to Resource');

  this.belongsTo(model('resource'), { as: 'target', foreignKey: 'targetId' });
  console.debug('Association belongs to Resource as Target');
};

module.exports = AssociationsModel;
