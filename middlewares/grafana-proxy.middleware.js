'use strict';

const express = require('express');
const router = express.Router();
const { createProxyMiddleware } = require('http-proxy-middleware');
const jwtMiddleware = require('@middlewares/jwt.middleware');
const { grafanaUrl } = require('@config');

router.use('/', jwtMiddleware, createProxyMiddleware({
  target: grafanaUrl,
  changeOrigin: false,
  logLevel: 'info',
  onProxyReq: function (proxyReq, req, res) {
    // Remove auth header from requests not coming from an iframe
    if (!req.get('Referer')?.includes(req.get('Host'))) {
      proxyReq.removeHeader('X-WEBAUTH-USER');
    } else {
      const grafanaUser = req.role || 'viewer';
      proxyReq.setHeader('X-WEBAUTH-USER', grafanaUser);
    }
  }
}));

module.exports = router;
