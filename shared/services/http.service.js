'use strict';

const axios = require('axios');

class HttpService {

  get(url, config) {
    return axios.get(url, config);
  }

  post(url, data, config) {
    return axios.post(url, data, config);
  }

  patch(url, data, config) {
    return axios.patch(url, data, config);
  }

  delete(url, config) {
    return axios.delete(url, config);
  }

}

module.exports = new HttpService();
