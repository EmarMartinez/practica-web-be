'use strict';

const routesWhitelist = [
  '/api/users/authenticate',

  //* EXAMPLES:
  //* String syntax:
  //* Basic format 'methods@path'
  //* Methods (optional): GET|POST|PATCH|DELETE
  //* Path (REGEXP is optional to set path string as RegExp): [REGEXP]path
  // 'GET|POST|PATCH@REGEXP^\/api\/assets\/\\d+$',
  //* Object syntax:
  // {
  //* List of whitelisted methods
  //   methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  //* Path (string format):
  //   path: '/api/assets',
  //* Path (RegExp format):
  //   path: /^\/api\/assets\/\d+$/
  // },
];

const isRouteWhiteListed = function (requestPath, requestMethod) {
  return routesWhitelist.some(route => {
    if (typeof route === 'string') {
      if (route.includes('@')) {
        const methods = route.split('@')[0].split('|');
        const path = route.split('@')[1];
        const includesMethod = methods.some(method => method === requestMethod);
        const includesPath = path.startsWith('REGEXP')
          ? new RegExp(path.slice(6)).test(requestPath)
          : requestPath.startsWith(path);
        return includesMethod && includesPath;
      } else {
        return route.startsWith('REGEXP')
          ? new RegExp(route.slice(6)).test(requestPath)
          : requestPath.startsWith(route);
      }
    } else if (route.constructor?.name === 'Object') {
      const { methods, path } = route;
      const includesMethod = methods.some(method => method === requestMethod);
      const includesPath = path.constructor.name === 'RegExp'
        ? path.test(requestPath)
        : requestPath.startsWith(path);
      return includesMethod && includesPath;
    }
  });
};

module.exports = isRouteWhiteListed;
