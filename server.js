const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mineflayer = require('mineflayer');
const { SocksProxyAgent } = require('socks-proxy-agent');

const TOR_PROXY = 'socks5h://127.0.0.1:9050';
const agent = new SocksProxyAgent(TOR_PROXY);

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const bots = new Map();
let active = false;
let reconnectTimers = new Map();

app.use(express.static('.'));
app.use(express.json());

function log(message) {
  console.log(message);
  io.emit('log', message);
}

app.post('/start', async (req, res) => {
  const { host, port, name, count, suffix, delay } = req.body;
  if (active) return res.status(400).send("Déjà actif");

  active = true;
  log(`🚀 Lancement de ${count} bots...`);

  for (let i = 0; i < count; i++) {
    if (!active) break;
    const botName = suffix ? `${name}_${i + 1}` : name;
    createBot(botName, host, port);
    await new Promise(r => setTimeout(r, delay || 2000));
  }

  res.sendStatus(200);
});

app.post('/stop', (_, res) => {
  active = false;
  bots.forEach(bot => bot.quit());
  bots.clear();
  reconnectTimers.forEach(clearTimeout);
  reconnectTimers.clear();
  log('🛑 Tous les bots ont été arrêtés.');
  res.sendStatus(200);
});

function createBot(username, host, port) {
  const bot = mineflayer.createBot({
    host,
    port,
    username,
    version: false,
    skipValidation: true,
    hideErrors: true,
    agent: agent
  });

  bots.set(username, bot);

  bot.once('spawn', () => {
    log(`✅ [${username}] connecté`);
    bot.setControlState('jump', true);
    setTimeout(() => bot.setControlState('jump', false), 300);
  });

  bot.on('end', () => {
    log(`❌ [${username}] déconnecté`);
    bots.delete(username);
    if (active) {
      const timer = setTimeout(() => {
        createBot(username, host, port);
        reconnectTimers.delete(username);
      }, 5000);
      reconnectTimers.set(username, timer);
    }
  });

  bot.on('error', err => {
    log(`⚠️ [${username}] erreur: ${err.message}`);
  });

  bot.on('kicked', reason => {
    log(`⛔ [${username}] kické: ${reason}`);
  });

  bot.on('message', (jsonMsg) => {
    log(`[CHAT] ${jsonMsg.toAnsi?.() || jsonMsg.toString()}`);
  });
}

app.post('/command', (req, res) => {
  const { command, botName, all } = req.body;
  if (all) {
    bots.forEach(bot => bot.chat(command));
    log(`📤 Tous les bots ont envoyé : ${command}`);
  } else {
    const bot = bots.get(botName);
    if (!bot) return res.status(404).send('Bot introuvable');
    bot.chat(command);
    log(`📤 ${botName} a envoyé : ${command}`);
  }
  res.sendStatus(200);
});

app.post('/spam', (req, res) => {
  const { command, botName, all } = req.body;
  if (all) {
    bots.forEach(bot => bot.chat(command));
  } else {
    const bot = bots.get(botName);
    if (bot) bot.chat(command);
  }
  res.sendStatus(200);
});

app.post('/move/random', (req, res) => {
  const { botName, radius, all } = req.body;
  if (!radius) return res.status(400).send('Rayon manquant');

  const moveBot = (bot) => {
    const pos = bot.entity?.position;
    if (!pos) return;
    const dx = (Math.random() * 2 - 1) * radius;
    const dz = (Math.random() * 2 - 1) * radius;
    bot.lookAt({ x: pos.x + dx, y: pos.y, z: pos.z + dz });
    bot.setControlState('forward', true);
    setTimeout(() => bot.setControlState('forward', false), 1500);
  };

  if (all) {
    bots.forEach(bot => moveBot(bot));
  } else {
    const bot = bots.get(botName);
    if (!bot) return res.status(404).send('Bot introuvable');
    moveBot(bot);
  }

  res.sendStatus(200);
});

app.post('/move/to', (req, res) => {
  const { botName, x, y, z, all } = req.body;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return res.status(400).send('Coordonnées invalides');

  const moveBot = (bot) => {
    bot.lookAt({ x, y, z });
    bot.setControlState('forward', true);
    setTimeout(() => bot.setControlState('forward', false), 1500);
  };

  if (all) {
    bots.forEach(bot => moveBot(bot));
  } else {
    const bot = bots.get(botName);
    if (!bot) return res.status(404).send('Bot introuvable');
    moveBot(bot);
  }

  res.sendStatus(200);
});

server.listen(PORT, () => {
  log(`🌐 Panel disponible sur http://localhost:${PORT}`);
});