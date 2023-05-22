'use strict';

const { Server } = require('socket.io');

let io;

const startSocketIo = function (server) {
  io = new Server(server);

  console.log('Socket.IO connected');

  io.on('connection', (socket) => {
    console.log('A user connected from socket', socket);

    socket.on('message', (msg) => {
      console.log('Message:', msg);
    });

    socket.on('disconnect', () => {
      console.log('user disconnected');
    });
  });
};

module.exports = { startSocketIo, io };
