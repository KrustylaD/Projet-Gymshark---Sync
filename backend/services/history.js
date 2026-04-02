const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'conversations.json');

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function loadAll() {
    ensureDataDir();
    if (!fs.existsSync(HISTORY_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function saveAll(data) {
    ensureDataDir();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getConversation(id) {
    const all = loadAll();
    return all[id] || null;
}

function saveConversation(id, messages, title) {
    const all = loadAll();
    const existing = all[id];
    all[id] = {
        id,
        title: title || (existing && existing.title) || extractTitle(messages),
        messages,
        updatedAt: new Date().toISOString(),
        createdAt: (existing && existing.createdAt) || new Date().toISOString(),
    };
    saveAll(all);
}

function deleteConversation(id) {
    const all = loadAll();
    if (!all[id]) return false;
    delete all[id];
    saveAll(all);
    return true;
}

function listConversations() {
    const all = loadAll();
    return Object.values(all)
        .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function extractTitle(messages) {
    const first = messages.find(m => m.role === 'user');
    if (!first) return 'Nouvelle conversation';
    const text = first.content.trim();
    return text.length > 60 ? text.slice(0, 57) + '...' : text;
}

module.exports = { getConversation, saveConversation, deleteConversation, listConversations };
