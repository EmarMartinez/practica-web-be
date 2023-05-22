'use strict';

const associationsService = require('./associations.service');
const { CrudController } = require('@shared/layers/crud.controller');

class AssociationsController extends CrudController {

}

module.exports = new AssociationsController(associationsService, 'associations', 'id'
  // , {
  //   //* (Optional) Name in SINGULAR to be used in response messages
  //   //* By default, path without final 's', spaces instead hyphens and first letter capitalized
  //   entityName: 'Association',
  //   //* (Optional) Entity gender for translated response messages: 'male' or 'female'
  //   gender: 'male',
  //   //* (Optional) Roles that have access to actions and additional actions, unless specific roles are set for them
  //   //* Built-in roles: 'any' for open access, 'authenticated' for autheticated users
  //   roles: ['any'],
  //   //* (Optional) Actions: String notation
  //   actions: ['list', 'read', 'create', 'update', 'delete'],
  //   //* (Optional) Actions: Object notation
  //   actions: [
  //     { name: 'list', roles: ['any'] },
  //     { name: 'read', roles: ['any'] },
  //     { name: 'create', roles: ['any'] },
  //     { name: 'update', roles: ['any'] },
  //     { name: 'delete', roles: ['any'] }
  //   ],
  //   //* (Optional) Filters allowed in query params. Other than these will be ignored.
  //   filters: ['limit', 'offset', 'order'],
  //   //* (Optional) Additional actions to include
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
  //   //* (Optional) Function that returns the final association object that will be sent as response
  //   mapEntity: function (association, req, res) {
  //     //* Your code to map association goes here
  //     return association;
  //   },
  //   //* (Optional) Arguments passed as options to services methods
  //   serviceArgs: {
  //     scope: 'defaultScope',
  //     ignoreSerialPk: true,
  //     createAssociatedEntities: false,
  //     updateAssociations: true
  //   },
  //   //* (Optional) Nested controllers for nested routes
  //   children: [
  //     {
  //       //* Instance of CrudController to be nested
  //       controller: xxxController,
  //       //* Name of the filter key in nested controller that link with parent controller.
  //       //* It may be equal to a foreign key in model (i.e. userId)
  //       //* or a nested key from an associated model referenced with dot notation (i.e. users.id)
  //       //* Foreign keys are only valid for 1:M associations, while dot notation is valid for 1:M and M:N
  //       filterKey: 'string'
  //     }
  //   ]
  // }
);
