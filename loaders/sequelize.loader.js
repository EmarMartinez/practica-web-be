'use strict';

const fs = require('fs');
const { UniqueConstraintError } = require('sequelize');
const eventsService = require('@shared/services/events.service');
const sequelize = require('@config/sequelize.config');
const i18n = require('@config/i18n.config');
const { adminFolder, tenantsFolder, preloadData, autoconvertExcel, isMultitenantEnabled, isRuntimeResourcesEnabled } = require('@config');
const { schema, alter, force, dropSchema } = require('@config').sequelize;

// Import tenants service only if multitenant is enabled
const tenantsService = isMultitenantEnabled ? require(`@api${adminFolder}/tenants/tenants.service`) : undefined;
// Import layers service only if runtime resurces are enabled
const layersService = isRuntimeResourcesEnabled ? require('@shared/services/layers.service') : undefined;

const dbNames = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  sqlite: 'SQLite',
  mssql: 'MSSQL'
};

module.exports = async function () {

  const dbName = dbNames[sequelize.getDialect()];

  try {
    console.log(i18n.__('Connecting to {{dbName}} database', { dbName }));
    // Connect to database
    try {
      await sequelize.authenticate();
      await sequelize.installPostgis();
    }
    // If connection error happens, database may not exist
    // Try to create it and connect again
    catch (err) {
      console.error('Connection error. Trying to create the database and reconnect...');
      await sequelize.createDatabase();
      await sequelize.authenticate();
      await sequelize.installPostgis();
    }
    console.log(i18n.__('{{dbName}} connection has been established successfully', { dbName }));
    process.on('exit', () => {
      console.log(i18n.__('Closing {{dbName}} database connection', { dbName }));
      sequelize.close();
      console.log(i18n.__('{{dbName}} database connection closed', { dbName }));
    });
    console.log(i18n.__('Creating models associations...'));
    for (const modelName in sequelize.models) {
      const model = sequelize.model(modelName);
      if (Object.hasOwnProperty.call(model, 'associate')) model.associate();
    }
    console.log(i18n.__('All models were successfully associated'));
    eventsService.repositories.emit('models loaded');
    console.log(i18n.__('Syncing models with database...'));

    if (autoconvertExcel) require('../excel2json');

    // Is multitenant is enabled, create all required schemas
    if (isMultitenantEnabled) {

      // Set tenants list to sync
      let tenants, savedTenants = [];
      // Create tenants from JSON files, is preload data enabled
      if (preloadData) {
        try {
          console.log('Getting tenants from JSON file...');
          tenants = JSON.parse(fs.readFileSync('./data/admin.tenants.data.json'));
          console.log('Tenants successfully read from JSON file');
        } catch (error) {
          console.error('Error reading JSON file:', error, '\nExisting');
          process.exit(0);
        }
      }
      // Otherwise, get them from DB or create only the admin tenant if DB is empty
      else {
        try {
          console.log('Getting existing tenants from DB...');
          savedTenants = await tenantsService.list();
          if (savedTenants.length === 0) {
            console.log('Tenants table is empty. An admin tenant will be created');
            tenants = [{ id: 'admin', name: 'admin' }];
          } else {
            tenants = savedTenants;
          }
        } catch (error) {
          console.log('There is no tenants table in DB. An admin tenant will be created');
          savedTenants = [];
          tenants = [{ id: 'admin', name: 'admin' }];
        }
      }

      // Sync models in each schema
      for (const tenant of tenants) {
        if (dropSchema && !alter) await sequelize.dropSchema(tenant.id);
        // Create schema if not exists
        await sequelize.createSchema(tenant.id);
        // Sync admin tenant when is the only one in list
        if (tenant.id === 'admin' && tenants.length === 0) {
          console.log('Syncing only an admin tenant. Alter option will be ignored');
          await sequelize.createSchema('temp');
          await sequelize.sync({ force, schema: 'temp' });
          await sequelize.dropSchema('temp');
        } else if (tenant.id !== 'admin') {
          if (alter) {
            for (const modelName in sequelize.models) {
              const model = sequelize.model(modelName);
              if (model._schema !== 'admin') model._schema = tenant.id;
            }
          }
          await sequelize.sync({ force: alter ? false : force, alter, schema: tenant.id });
        }
      }

      // Save tenants in DB if preload enabled or DB is empty
      // Bulk creation ignores duplicates and sync tables
      if (preloadData || savedTenants.length === 0) {
        try {
          console.log('Saving tenants in DB..');
          await tenantsService.bulkCreate(tenants, { ignoreSerialPk: false, updateAssociations: false, preload: true, ignoreIds: false, syncModels: false });
        } catch (error) {
          if (!(error instanceof UniqueConstraintError)) {
            console.error('Error creating tenants:', error);
            process.exit(0);
          }
        }
        console.log('Tenants successfully saved in DB');
      }
      console.log(i18n.__('Tenants models successfully synced'));
    }
    // if not multitenant, just sync models
    else {

      // Create tables in default schema
      if (dropSchema && !alter) sequelize.dropSchema(schema);
      await sequelize.createSchema(schema);
      if (alter) for (const modelName in sequelize.models) sequelize.model(modelName)._schema = schema;
      await sequelize.sync({ force: alter ? false : force, alter, schema });
      if (!alter) for (const modelName in sequelize.models) sequelize.model(modelName)._schema = schema;
      console.log(i18n.__('Models successfully synced'));
    }

    // Add rows to tables, if preload data enabled
    if (preloadData) {

      let dataFilenames = fs.readdirSync('./data')
        .filter(filename => filename.endsWith('.data.json') && !filename.startsWith('admin.tenants.'));
      console.log('Data files read:', dataFilenames.join(', '));

      const resourceNameIndex = isMultitenantEnabled ? 1 : 0;
      let dataFileGroups = [dataFilenames];
      // If config file exists, read and apply settings
      let config;
      if (fs.existsSync('./data/data.config.json')) {
        config = JSON.parse(fs.readFileSync('./data/data.config.json'));
        // Order of resources creation
        if (config.order?.length > 0) {
          const orderedFiles = dataFilenames
            .filter(filename => config.order.includes(filename.split('.')[resourceNameIndex]))
            .sort((filenameA, filenameB) => {
              const resourceA = filenameA.split('.')[resourceNameIndex];
              const resourceB = filenameB.split('.')[resourceNameIndex];
              return config.order.indexOf(resourceA) - config.order.indexOf(resourceB);
            });
          const ignoredFiles = dataFilenames
            .filter(filename => !config.order.includes(filename.split('.')[resourceNameIndex]));
          dataFileGroups[0] = orderedFiles.concat(ignoredFiles);
        }
        // Do not create these resources (exclude has precedence over include)
        if (config.exclude?.length > 0) {
          dataFileGroups[0] = dataFileGroups[0]
            .filter(filename => !config.exclude.includes(filename.split('.')[resourceNameIndex]));
        }
        // Create only these resources
        else if (config.include?.length > 0) {
          dataFileGroups[0] = dataFileGroups[0]
            .filter(filename => config.include.includes(filename.split('.')[resourceNameIndex]));
        }
        // Create these resources after the rest are created and updated
        if (config?.postupdate?.length > 0) {
          // If post update is an array of strings
          if (config.postupdate.every(item => typeof item === 'string')) {
            // Collect post update resources
            const postUpdateDataFilenames = dataFileGroups[0]
              .filter(filename => config.postupdate.includes(filename.split('.')[resourceNameIndex]));
            // Remove post update resources from initial creation and update
            dataFileGroups[0] = dataFileGroups[0]
              .filter(filename => !config.postupdate.includes(filename.split('.')[resourceNameIndex]));
            // Compose final array of arrays
            dataFileGroups = [dataFileGroups[0], postUpdateDataFilenames];
          }
          // If post update is an array of arrays of strings
          else if (config.postupdate
            .every(array => Array.isArray(array) && array.every(item => typeof item === 'string'))) {
            // Collect post update resources
            const postUpdateDataFilenames = config.postupdate
              .map(array => {
                const postUpdateDataFilenames = dataFileGroups[0]
                  .filter(filename => array.includes(filename.split('.')[resourceNameIndex]));
                return postUpdateDataFilenames;
              });
            // Remove post update resources from initial creation and update
            dataFileGroups[0] = dataFileGroups[0]
              .filter(filename => ![].concat(...config.postupdate).includes(filename.split('.')[resourceNameIndex]));
            dataFileGroups = [dataFileGroups[0], ...postUpdateDataFilenames];
          } else {
            console.log('Not valid format for postupdate field in data.config.json file. Exiting...');
            process.exit(0);
          }
        }

        console.log('Data files to process:', [...dataFileGroups].join(', '));
      }

      const errors = [];
      for (const [index, filenames] of dataFileGroups.entries()) {

        const resourcesData = [];
        for (let filename of filenames) {
          // Get resource name from filename
          const resourceName = filename.split('.')[resourceNameIndex];
          // Get folder to import resource service, if exists
          let resourceFolder = '';
          if (config?.folders && Object.keys(config.folders).length > 0) {
            for (const folder in config.folders) {
              if (config.folders[folder].includes(resourceName)) {
                resourceFolder = '/' + folder;
                break;
              }
            }
          }
          // Get service for this resource
          const resourceService = config?.runtime?.includes(resourceName)
            ? layersService.services[resourceName + 'Service']
            : require(`@api${filename.split('.')[0] === 'admin'
              ? adminFolder
              : tenantsFolder}${resourceFolder}/${resourceName}/${resourceName}.service`);
          if (!resourceService) throw new Error(`Service for resource ${resourceName} not found in layersService`);
          // Create resources from JSON file content
          const resources = JSON.parse(fs.readFileSync(`./data/${filename}`));
          const resourceModel = resourceService.repository.model;
          const associationsFields = Object.keys(resourceModel.associations);
          resourcesData.push({ filename, name: resourceName, service: resourceService, resources, model: resourceModel, associationsFields });
        }

        // Preload data in two steps. One, to insert rows in tables. Two, to set associations

        let tenantName;

        // STEP 1: Rows insertion
        for (const data of resourcesData) {
          const { filename, name: resourceName, service: resourceService, resources, model: resourceModel, associationsFields } = data;

          // Change tenant before creation, if multitenant enabled
          if (isMultitenantEnabled) {
            tenantName = filename.split('.')[0];
            // Check if tenant already exists. Otherwise, skip it
            if (!(await tenantsService.read({ id: tenantName }))) {
              console.log(i18n.__('Tenant \'{{tenantName}}\' not found in DB. Skipping...', { tenantName }));
              continue;
            }
            console.log(i18n.__('Creating in tenant \'{{tenantName}}\'', { tenantName }));
          }

          // If resource has no associations fields or they are IDs,
          // arrays of IDs or ID-object pairs, just create resources in bulk.
          // Associations fields are ignored by bulk creation, and will be used in the update process below
          if (
            associationsFields.length === 0 ||
            resources
              .every(resource =>
                associationsFields
                  .every(field => !resource[field] || ['number', 'string'].includes(typeof resource[field]) ||
                    (
                      Array.isArray(resource[field]) && resource[field]
                        .every(value => ['number', 'string'].includes(typeof value) ||
                          (
                            Array.isArray(value) && value.length === 2 &&
                            ['number', 'string'].includes(typeof value[0]) &&
                            typeof value[1] === 'object' && !Array.isArray(value[1])
                          )
                        )
                    )
                  )
              )
          ) {
            try {
              console.log(`Creating '${resourceName}' in bulk...`);
              for (const resource of resources) {
                const resourceId = resource[resourceModel.primaryKeyField] || resource[Object.keys(resource)[0]];
                const validationResult = await resourceService.validate(resource, false, resourceId, i18n.defaultLocale, tenantName, 'create');
                if (typeof validationResult === 'string') {
                  throw new Error(`Error creating '${resourceId}' in '${resourceName}': ${validationResult}`);
                }
              }
              await resourceService.bulkCreate(resources, { tenant: tenantName, ignoreSerialPk: false, updateAssociations: false, preload: true });
              console.log(`Success creating '${resourceName}' in bulk`);
            } catch (error) {
              console.error(error);
              const message = error.message || i18n.__(error.errors?.[0]?.errors?.errors?.[0]?.message,
                { field: error.errors?.[0]?.errors?.errors?.[0]?.path });
              console.error(message);
              errors.push({ action: 'bulk create', resource: resourceName, message });
              continue;
            }
          }
          // If associations fields are objects or arrays of objects, they are entity definitions of associated tables
          // Then, create resources one by one to also create associated resources at the same time
          else if (
            resources.every(resource =>
              associationsFields
                .every(field => !resource[field] ||
                  (typeof resource[field] === 'object' && !Array.isArray(resource[field]) && resource[field] !== null) ||
                  Array.isArray(resource[field]) && resource[field]
                    .every(value => typeof value === 'object' && !Array.isArray(value) && value !== null)))
          ) {
            console.log(`Creating '${resourceName}' one by one...`);
            for (const resource of resources) {
              try {
                const resourceId = resource[resourceModel.primaryKeyField] || resource[Object.keys(resource)[0]];
                const validationResult = await resourceService.validate(resource, false, resourceId, i18n.defaultLocale, tenantName, 'create');
                if (typeof validationResult === 'string') {
                  throw new Error(`Error creating '${resourceId}' in '${resourceName}': ${validationResult}`);
                }
                await resourceService.create(resource, { tenant: tenantName, ignoreSerialPk: false, createAssociatedEntities: true, updateAssociations: false, preload: true });
                console.log(`Success creating '${resourceId}' in '${resourceName}'`);
              }
              // If resource already exists, creation will throw an error
              // that is catched to ignore ir and continue the loop
              catch (error) {
                console.error(error);
                // Ignore duplicate key errors, as for bulk creation
                if (error instanceof UniqueConstraintError) continue;
                const resourceId = resource[resourceModel.primaryKeyField] || resource[Object.keys(resource)[0]];
                console.error(`Error creating '${resourceId}' in '${resourceName}': ${error.message}`);
                errors.push({ action: 'create', resource: resourceName, id: resourceId, message: error.message });
                continue;
              }
            }
          }
          else {
            console.error(`No data format valid in an associations field of at least one item in '${resourceName}' JSON file`);
            console.log(`Edit '${resourceName}' JSON file and run app again. Exiting...`);
            process.exit(0);
          }

          console.log(i18n.__('Data for \'{{resourceName}}\' successfully created', { resourceName }));
        }

        // STEP 2: Associations creation
        for (const data of resourcesData) {
          const { filename, name: resourceName, service: resourceService, resources, model: resourceModel, associationsFields } = data;

          // Change tenant before creation, if multitenant enabled
          if (isMultitenantEnabled) {
            tenantName = filename.split('.')[0];
            // Check if tenant already exists. Otherwise, skip it
            if (!(await tenantsService.read({ id: tenantName }))) {
              console.log(i18n.__('Tenant \'{{tenantName}}\' not found in DB. Skipping...', { tenantName }));
              continue;
            }
            console.log(i18n.__('Updating in tenant \'{{tenantName}}\'', { tenantName }));
          }

          // If resource has no associations fields or they are invalid arrays of IDs, skip
          if ((associationsFields.length === 0) || (resources.every(resource => associationsFields.every(field => !resource[field])))) {
            console.log(`No associations fields found in '${resourceName}' JSON file. Skipping... `);
            continue;
          }
          if (!resources.every(resource =>
            associationsFields
              .every(field => !resource[field] || ['number', 'string'].includes(typeof resource[field]) ||
                (
                  Array.isArray(resource[field]) && resource[field]
                    .every(value => ['number', 'string'].includes(typeof value) ||
                      (
                        Array.isArray(value) && value.length === 2 &&
                        ['number', 'string'].includes(typeof value[0]) &&
                        typeof value[1] === 'object' && !Array.isArray(value[1])
                      )
                    )
                )
              )
          )
          ) {
            console.log(`No valid IDs associations fields found in '${resourceName}' JSON file. Skipping... `);
            continue;
          }

          // Set associations
          console.log(`Updating '${resourceName}' one by one...`);
          for (const resource of resources) {
            if (associationsFields.every(field => !resource[field])) continue;
            const filteredResource = {};
            associationsFields.forEach(field => {
              if (resource[field]) filteredResource[field] = resource[field];
            });
            try {
              const resourceId = resource[resourceModel.primaryKeyField] || resource[Object.keys(resource)[0]];
              const validationResult = await resourceService.validate(resource, false, resourceId, i18n.defaultLocale, tenantName, 'update');
              if (typeof validationResult === 'string') {
                throw new Error(`Error updating '${resourceId}' in '${resourceName}': ${validationResult}`);
              }
              await resourceService.update(
                { [resourceModel.primaryKeyField]: resource[resourceModel.primaryKeyField] },
                filteredResource,
                { tenant: tenantName, preload: true }
              );
              console.log(`Success updating '${resourceId}' in '${resourceName}'`);
            } catch (error) {
              console.error(error);
              const resourceId = resource[resourceModel.primaryKeyField] || resource[Object.keys(resource)[0]];
              console.error(`Error updating '${resourceId}' in '${resourceName}'`);
              errors.push({ action: 'update', resource: resourceName, id: resourceId, message: error.message });
              continue;
            }
          }

          console.log(i18n.__('Associations for \'{{resourceName}}\' successfully created', { resourceName }));
        }

        if (index === 0 && isRuntimeResourcesEnabled) {
          // Create layers for runtime resources
          await layersService.createLayers();
        }
      }

      if (errors.length === 0) {
        console.log('\x1b[32m✔️ Data successfully loaded with no errors\x1b[0m');
      } else {
        console.error(`\x1b[31m❌ Data loaded with ${errors.length} error${errors.length < 2 ? '' : 's'}:\x1b[0m`, errors);
      }

    } else if (isRuntimeResourcesEnabled) {
      // Create layers for runtime resources
      await layersService.createLayers();
    }

  } catch (err) {
    console.error(i18n.__('Error loading {{dbName}} database', { dbName }));
    console.error(err);
    sequelize.close();
    process.exit(1);
  }
};
