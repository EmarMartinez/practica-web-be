'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('@config/sequelize.config');
const { isMultitenantEnabled } = require('@config');
const { notNull } = require('@config/validations.config');

const options = {};

if (isMultitenantEnabled) {
  options.schema = 'admin';
}

sequelize.define(
  'resourceTypeProperty',
  {},
  options
);

module.exports = ResourceTypesModel;
