'use strict';

const Sequelize = require('sequelize');
const { dialect, db, user, pass, host, port, logging, timestamps, underscored } = require('@config').sequelize;

const logger = function (queryString) {
  console.debug(queryString);
};

const sequelize = new Sequelize(db, user, pass, {
  host,
  port,
  dialect,
  logging: logging ? logger : false,
  define: {
    timestamps,
    underscored
  }
});

sequelize.createDatabase = async function () {
  const auxiliaryConnection = new Sequelize('postgres', user, pass, {
    host,
    port,
    dialect: sequelize.getDialect(),
    logging: logger
  });
  await auxiliaryConnection.authenticate();
  await auxiliaryConnection.getQueryInterface().createDatabase(db);
  await auxiliaryConnection.close();
};

sequelize.installPostgis = async function () {
  try {
    console.log('installing PostGIS extensions...');
    await this.query(
      'CREATE EXTENSION IF NOT EXISTS postgis;' +
      'CREATE EXTENSION IF NOT EXISTS postgis_raster;' +
      'CREATE EXTENSION IF NOT EXISTS postgis_topology;' +
      'CREATE EXTENSION IF NOT EXISTS postgis_sfcgal;' +
      'CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;' +
      'CREATE EXTENSION IF NOT EXISTS address_standardizer;' +
      'CREATE EXTENSION IF NOT EXISTS postgis_tiger_geocoder;'
    );
  } catch (error) {
    console.log('PostGIS is not enabled in this database. Skipping...');
  }
};

module.exports = sequelize;
