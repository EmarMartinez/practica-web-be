'use strict';

const i18n = require('@config/i18n.config');
const eventsService = require('@shared/services/events.service');

class BaseService {

  i18n = i18n;

  constructor({ dependencies = {}, events = [] } = {}) {
    this.events = {
      controllers: eventsService.controllers,
      services: eventsService.services,
      repositories: eventsService.repositories
    };

    for (const key in dependencies) {
      this[key] = dependencies[key];
    }

    for (const event of events) {
      this.events[event.layer || 'services'].on(event.name, this[event.listener].bind(this));
    }

  }

}

module.exports = BaseService;
