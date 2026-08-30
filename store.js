const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const PANELS_FILE = path.join(DATA_DIR, 'panels.json');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
for (const f of [ROOMS_FILE, ADMINS_FILE, PANELS_FILE, ATTENDANCE_FILE, CONFIG_FILE, FEEDBACK_FILE]) {
  if (!fs.existsSync(f)) fs.writeFileSync(f, '{}');
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}


function getRooms(guildId) {
  const all = readJSON(ROOMS_FILE);
  return all[guildId] || {};
}
function setRoom(guildId, roomKey, label, waitingChannelId) {
  const all = readJSON(ROOMS_FILE);
  if (!all[guildId]) all[guildId] = {};
  all[guildId][roomKey] = { label, waitingChannelId };
  writeJSON(ROOMS_FILE, all);
}
function deleteRoom(guildId, roomKey) {
  const all = readJSON(ROOMS_FILE);
  if (all[guildId]) {
    delete all[guildId][roomKey];
    writeJSON(ROOMS_FILE, all);
  }
}

function getAdmin(guildId, userId) {
  const all = readJSON(ADMINS_FILE);
  return (all[guildId] && all[guildId][userId]) || { status: 'busy', assignments: {} };
}
function saveAdmin(guildId, userId, adminData) {
  const all = readJSON(ADMINS_FILE);
  if (!all[guildId]) all[guildId] = {};
  all[guildId][userId] = adminData;
  writeJSON(ADMINS_FILE, all);
}
function getAllAdmins(guildId) {
  const all = readJSON(ADMINS_FILE);
  return all[guildId] || {};
}
function getLastPicked(guildId, roomKey) {
  const all = readJSON(ADMINS_FILE);
  return (all[guildId] && all[guildId].__lastPicked && all[guildId].__lastPicked[roomKey]) || null;
}
function setLastPicked(guildId, roomKey, userId) {
  const all = readJSON(ADMINS_FILE);
  if (!all[guildId]) all[guildId] = {};
  if (!all[guildId].__lastPicked) all[guildId].__lastPicked = {};
  all[guildId].__lastPicked[roomKey] = userId;
  writeJSON(ADMINS_FILE, all);
}

function getPanel(guildId, panelType) {
  const all = readJSON(PANELS_FILE);
  return (all[guildId] && all[guildId][panelType]) || null;
}
function setPanel(guildId, panelType, channelId, messageId) {
  const all = readJSON(PANELS_FILE);
  if (!all[guildId]) all[guildId] = {};
  all[guildId][panelType] = { channelId, messageId };
  writeJSON(PANELS_FILE, all);
}

function getAttendance(guildId, userId) {
  const all = readJSON(ATTENDANCE_FILE);
  return (all[guildId] && all[guildId][userId]) || { checkedInAt: null, totalSeconds: 0, totalPoints: 0 };
}
function saveAttendance(guildId, userId, data) {
  const all = readJSON(ATTENDANCE_FILE);
  if (!all[guildId]) all[guildId] = {};
  all[guildId][userId] = data;
  writeJSON(ATTENDANCE_FILE, all);
}
function getAllAttendance(guildId) {
  const all = readJSON(ATTENDANCE_FILE);
  return all[guildId] || {};
}

function getConfig(guildId) {
  const all = readJSON(CONFIG_FILE);
  return { pointsPerHour: 1, doneChannelId: null, ...(all[guildId] || {}) };
}
function setConfig(guildId, partialConfig) {
  const all = readJSON(CONFIG_FILE);
  all[guildId] = { ...getConfig(guildId), ...partialConfig };
  writeJSON(CONFIG_FILE, all);
}


function addFeedback(guildId, userId, rating, feedback) {
  const all = readJSON(FEEDBACK_FILE);
  if (!all[guildId]) all[guildId] = [];
  all[guildId].push({ userId, rating, feedback, timestamp: Date.now() });
  writeJSON(FEEDBACK_FILE, all);
}
function getFeedback(guildId, limit = 10) {
  const all = readJSON(FEEDBACK_FILE);
  const list = all[guildId] || [];
  return list.slice(-limit).reverse();
}

module.exports = {
  getRooms, setRoom, deleteRoom,
  getAdmin, saveAdmin, getAllAdmins,
  getLastPicked, setLastPicked,
  getPanel, setPanel,
  getAttendance, saveAttendance, getAllAttendance,
  getConfig, setConfig,
  addFeedback, getFeedback,
};
