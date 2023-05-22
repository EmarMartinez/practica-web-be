'use strict';

const resourcesService = require('./resources.service');
const { CrudController } = require('@shared/layers/crud.controller');

class ResourcesController extends CrudController {

}

module.exports = new ResourcesController(resourcesService, 'resources', 'id'
  // , {
  //   //* Name in SINGULAR to be used in response messages
  //   //* By default, path without final 's', spaces instead hyphens and first letter capitalized
  //   entityName: 'Resource',
  //   //* Entity gender for translated response messages: 'male' or 'female'
  //   gender: 'male',
  //   //* Roles that have access to actions and additional actions, unless specific roles are set for them
  //   //* Built-in roles: 'any' for open access, 'authenticated' for autheticated users
  //   roles: ['any'],
  //   //* Actions: String notation
  //   actions: ['list', 'read', 'create', 'update', 'delete'],
  //   //* Actions: Object notation
  //   actions: [
  //     { name: 'list', roles: ['any'] },
  //     { name: 'read', roles: ['any'] },
  //     { name: 'create', roles: ['any'] },
  //     { name: 'update', roles: ['any'] },
  //     { name: 'delete', roles: ['any'] }
  //   ],
  //   //* Additional actions to include
  //   additionalActions: [
  //     {
  //       //* Custom action name (it usually matches custom method name)
  //       name: 'doSomething',
  //       //* HTTP method to execute the action: get, post, patch, delete...
  //       method: 'get',
  //       //* (Optional) Array of class methods names to be executed for this path
  //       //* By default it executes the method named as action name
  //       middlewares: ['doSomething'],
  //       //* (Optional) Roles allowed to perform the action
  //       roles: ['any'],
  //       //* (Optional) Path name to be used (instead of action name)
  //       //* Usually needed to keep paths as kebab-case and method names as camelCase
  //       path: 'do-something'
  //     }
  //   ],
  //   //* (Optional) Function that returns the final resource object that will be sent as response
  //   mapEntity: function (resource, req, res) {
  //     //* Your code to map resource goes here
  //     return resource;
  //   },
  //   //* (Optional) Nested controllers for nested routes
  //   children: [
  //     {
  //       //* Instance of CrudController to be nested
  //       controller: xxxController,
  //       //* Name of the foreign key in nested controller that link with parent controller. It must be equal to foreign key in DB
  //       foreignKey: 'string'
  //     }
  //   ]
  // }
);
