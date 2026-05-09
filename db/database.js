const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data.json');

let store = { users:[], tickets:[], notifications:[], comments:[], attachments:[], uc:1, tc:1, nc:1, cc:1, ac:1 };

function save() { fs.writeFileSync(DB_PATH, JSON.stringify(store), 'utf8'); }

function load() {
  if (fs.existsSync(DB_PATH)) {
    try {
      store = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      if (!store.comments) store.comments = [];
      if (!store.attachments) store.attachments = [];
      if (!store.cc) store.cc = 1;
      if (!store.ac) store.ac = 1;
    } catch(e) {}
  }
}

function seed() {
  if (store.users.length > 0) return;
  const list = [
    { name: 'أحمد مغربي', email: 'aahmad.magrabi@gmail.com', password: 'Aa12341234', role: 'admin' },
    { name: 'دعم فني', email: 'support@test.com', password: '123456', role: 'support' },
    { name: 'دعم متقدم', email: 'advanced@test.com', password: '123456', role: 'advanced' },
    { name: 'مطور', email: 'dev@test.com', password: '123456', role: 'dev' },
  ];
  for (const u of list) {
    store.users.push({ id: store.uc++, name: u.name, email: u.email, password: bcrypt.hashSync(u.password, 10), role: u.role, phone: '', created_at: new Date().toISOString().slice(0,10) });
  }
  save();
  console.log('✅ تم إنشاء البيانات الأولية');
}

const db = {
  // ── Users ──────────────────────────────────────────────
  findUser(email) { return store.users.find(u => u.email === email) || null; },
  findUserById(id) { return store.users.find(u => u.id === parseInt(id)) || null; },
  allUsers() { return store.users; },
  userExists(email) { return !!store.users.find(u => u.email === email); },
  addUser(name, email, hash, role) {
    const u = { id: store.uc++, name, email, password: hash, role, phone: '', created_at: new Date().toISOString().slice(0,10) };
    store.users.push(u); save(); return u;
  },
  deleteUser(id) {
    id = parseInt(id);
    const tickets = store.tickets.filter(t => t.user_id === id);
    tickets.forEach(t => {
      store.notifications = store.notifications.filter(n => n.ticket_id !== t.id);
      store.comments = store.comments.filter(c => c.ticket_id !== t.id);
      store.attachments = store.attachments.filter(a => a.ticket_id !== t.id);
    });
    store.tickets = store.tickets.filter(t => t.user_id !== id);
    store.notifications = store.notifications.filter(n => n.user_id !== id);
    store.users = store.users.filter(u => u.id !== id);
    save();
  },
  updateUserInfo(id, name, email, phone, role) {
    const u = store.users.find(u => u.id === parseInt(id));
    if (u) { u.name = name; u.email = email; u.phone = phone; u.role = role; save(); }
  },
  updateProfile(id, name, phone) {
    const u = store.users.find(u => u.id === parseInt(id));
    if (u) { u.name = name; u.phone = phone; save(); }
  },
  updatePassword(id, hash) {
    const u = store.users.find(u => u.id === parseInt(id));
    if (u) { u.password = hash; save(); }
  },

  // ── Tickets ─────────────────────────────────────────────
  allTickets() { return [...store.tickets].reverse(); },
  userTickets(uid) { return store.tickets.filter(t => t.user_id === parseInt(uid)).reverse(); },
  getTicket(id) { return store.tickets.find(t => t.id === parseInt(id)) || null; },
  addTicket(data) {
    const t = {
      id: store.tc++,
      ticket_number: 'TKT-' + String(store.tc-1).padStart(3,'0'),
      ...data,
      priority: data.priority || 'متوسطة',
      status: 'جديدة',
      close_note: '',
      closed_by: '',
      created_at: new Date().toISOString().slice(0,10),
      updated_at: new Date().toISOString().slice(0,10)
    };
    store.tickets.push(t); save(); return t;
  },
  setReview(id) {
    const t = store.tickets.find(t => t.id === parseInt(id));
    if (t) { t.status = 'قيد المراجعة'; t.updated_at = new Date().toISOString().slice(0,10); save(); }
  },
  closeTicket(id, note, by) {
    const t = store.tickets.find(t => t.id === parseInt(id));
    if (t) { t.status = 'مغلقة'; t.close_note = note; t.closed_by = by; t.updated_at = new Date().toISOString().slice(0,10); save(); return t; }
    return null;
  },
  deleteTicket(id) {
    id = parseInt(id);
    store.notifications = store.notifications.filter(n => n.ticket_id !== id);
    store.comments = store.comments.filter(c => c.ticket_id !== id);
    store.attachments = store.attachments.filter(a => a.ticket_id !== id);
    store.tickets = store.tickets.filter(t => t.id !== id);
    save();
  },
  editTicket(id, data) {
    const t = store.tickets.find(t => t.id === parseInt(id));
    if (t) { Object.assign(t, data); t.updated_at = new Date().toISOString().slice(0,10); save(); }
  },
  stats() {
    const total = store.tickets.length;
    const today = new Date().toISOString().slice(0,10);
    return {
      total,
      new: store.tickets.filter(t => t.status === 'جديدة').length,
      review: store.tickets.filter(t => t.status === 'قيد المراجعة').length,
      closed: store.tickets.filter(t => t.status === 'مغلقة').length,
      today: store.tickets.filter(t => t.created_at === today).length,
    };
  },

  // ── Notifications ────────────────────────────────────────
  addNotif(user_id, ticket_id, ticket_title, message, type) {
    store.notifications.push({ id: store.nc++, user_id: parseInt(user_id), ticket_id: parseInt(ticket_id), ticket_title, message, type: type||'info', is_read: 0, created_at: new Date().toISOString().slice(0,10) });
    save();
  },
  addNotifToRole(role, ticket_id, ticket_title, message, type) {
    store.users.filter(u => u.role === role).forEach(u => {
      store.notifications.push({ id: store.nc++, user_id: u.id, ticket_id: parseInt(ticket_id), ticket_title, message, type: type||'info', is_read: 0, created_at: new Date().toISOString().slice(0,10) });
    });
    save();
  },
  userNotifs(uid) { return store.notifications.filter(n => n.user_id === parseInt(uid)).reverse(); },
  getUsersByRole(role) { return store.users.filter(u => u.role === role); },
  markRead(uid) { store.notifications.filter(n => n.user_id === parseInt(uid)).forEach(n => n.is_read = 1); save(); },

  // ── Comments ─────────────────────────────────────────────
  getComments(ticket_id) { return store.comments.filter(c => c.ticket_id === parseInt(ticket_id)); },
  addComment(ticket_id, author, role, text) {
    const c = { id: store.cc++, ticket_id: parseInt(ticket_id), author, role, text, created_at: new Date().toISOString().slice(0,10) + ' ' + new Date().toTimeString().slice(0,5) };
    store.comments.push(c); save(); return c;
  },

  // ── Attachments ──────────────────────────────────────────
  getAttachments(ticket_id) { return store.attachments.filter(a => a.ticket_id === parseInt(ticket_id)); },
  addAttachment(ticket_id, data) {
    const a = { id: store.ac++, ticket_id: parseInt(ticket_id), ...data };
    store.attachments.push(a); save(); return a;
  },
  deleteAttachment(ticket_id, fileId) {
    const a = store.attachments.find(a => a.id === parseInt(fileId) && a.ticket_id === parseInt(ticket_id));
    if (a) { store.attachments = store.attachments.filter(x => x.id !== a.id); save(); }
    return a;
  },
};

async function initDB() { load(); seed(); console.log('✅ قاعدة البيانات جاهزة'); return db; }
module.exports = { initDB };
