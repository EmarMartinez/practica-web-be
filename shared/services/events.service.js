'use strict';

const EventEmitter = require('events');

class eventsService {

  constructor(EventEmitter) {
    this.controllers = new EventEmitter();
    this.services = new EventEmitter();
    this.repositories = new EventEmitter();
    // Allow more listeners to be used once for repositories on start up
    // This removes console warning
    this.controllers.setMaxListeners(20);
    this.services.setMaxListeners(20);
    this.repositories.setMaxListeners(20);
  }
}

module.exports = new eventsService(EventEmitter);
