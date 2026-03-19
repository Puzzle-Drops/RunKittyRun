const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const framework = require('./server/framework');
const game = require('./game/arrow');

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, 'public')));

const wss = new WebSocketServer({ server });

framework.init(wss, game);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`PDROP Arrow running on port ${PORT}`);
});
