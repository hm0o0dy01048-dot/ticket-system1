require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

async function initDB() {
  // Create tables
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'support',
      phone TEXT DEFAULT '',
      created_at DATE DEFAULT CURRENT_DATE
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      ticket_number TEXT UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id),
      user_name TEXT NOT NULL,
      title TEXT NOT NULL,
      identity_number TEXT NOT NULL,
      request_number TEXT DEFAULT '',
      description TEXT NOT NULL,
      priority TEXT DEFAULT 'متوسطة',
      status TEXT DEFAULT 'جديدة',
      close_note TEXT DEFAULT '',
      closed_by TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
      ticket_title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      created_at DATE DEFAULT CURRENT_DATE
    );

    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      originalname TEXT NOT NULL,
      size INTEGER NOT NULL,
      uploaded_by TEXT NOT NULL,
      uploaded_at DATE DEFAULT CURRENT_DATE
    );
  `);

  // Seed admin user
  const existing = await query('SELECT id FROM users WHERE role=$1', ['admin']);
  if (existing.rows.length === 0) {
    const hash = bcrypt.hashSync('Aa12341234', 10);
    await query(
      'INSERT INTO users (name,email,password,role) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      ['أحمد مغربي', 'aahmad.magrabi@gmail.com', hash, 'admin']
    );
    // Seed test accounts
    const tests = [
      ['دعم فني', 'support@test.com', 'support'],
      ['دعم متقدم', 'advanced@test.com', 'advanced'],
      ['مطور', 'dev@test.com', 'dev'],
    ];
    for (const [name, email, role] of tests) {
      const h = bcrypt.hashSync('123456', 10);
      await query('INSERT INTO users (name,email,password,role) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [name, email, h, role]);
    }
    console.log('✅ تم إنشاء البيانات الأولية');
  }

  console.log('✅ قاعدة البيانات جاهزة');

  const db = {
    // ── Users ──────────────────────────────────────────────
    async findUser(email) {
      const r = await query('SELECT * FROM users WHERE email=$1', [email]);
      return r.rows[0] || null;
    },
    async findUserById(id) {
      const r = await query('SELECT * FROM users WHERE id=$1', [parseInt(id)]);
      return r.rows[0] || null;
    },
    async allUsers() {
      const r = await query('SELECT id,name,email,role,phone,created_at FROM users ORDER BY id');
      return r.rows;
    },
    async userExists(email) {
      const r = await query('SELECT id FROM users WHERE email=$1', [email]);
      return r.rows.length > 0;
    },
    async addUser(name, email, hash, role) {
      const r = await query('INSERT INTO users (name,email,password,role) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role', [name, email, hash, role]);
      return r.rows[0];
    },
    async deleteUser(id) {
      await query('DELETE FROM users WHERE id=$1', [parseInt(id)]);
    },
    async updateProfile(id, name, phone) {
      await query('UPDATE users SET name=$1,phone=$2 WHERE id=$3', [name, phone||'', parseInt(id)]);
    },
    async updatePassword(id, hash) {
      await query('UPDATE users SET password=$1 WHERE id=$2', [hash, parseInt(id)]);
    },
    async updateUserInfo(id, name, email, phone, role) {
      await query('UPDATE users SET name=$1,email=$2,phone=$3,role=$4 WHERE id=$5', [name, email, phone||'', role, parseInt(id)]);
    },
    async getUsersByRole(role) {
      const r = await query('SELECT * FROM users WHERE role=$1', [role]);
      return r.rows;
    },

    // ── Tickets ─────────────────────────────────────────────
    async allTickets() {
      const r = await query('SELECT * FROM tickets ORDER BY id DESC');
      return r.rows;
    },
    async userTickets(uid) {
      const r = await query('SELECT * FROM tickets WHERE user_id=$1 ORDER BY id DESC', [parseInt(uid)]);
      return r.rows;
    },
    async getTicket(id) {
      const r = await query('SELECT * FROM tickets WHERE id=$1', [parseInt(id)]);
      return r.rows[0] || null;
    },
    async addTicket(data) {
      const countR = await query('SELECT COUNT(*) FROM tickets');
      const num = parseInt(countR.rows[0].count) + 1;
      const ticket_number = 'TKT-' + String(num).padStart(3,'0');
      const r = await query(
        `INSERT INTO tickets (ticket_number,user_id,user_name,title,identity_number,request_number,description,priority)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [ticket_number, data.user_id, data.user_name, data.title, data.identity_number, data.request_number||'', data.description, data.priority||'متوسطة']
      );
      return r.rows[0];
    },
    async setReview(id) {
      await query("UPDATE tickets SET status='قيد المراجعة',updated_at=NOW() WHERE id=$1", [parseInt(id)]);
    },
    async closeTicket(id, note, by) {
      await query("UPDATE tickets SET status='مغلقة',close_note=$1,closed_by=$2,updated_at=NOW() WHERE id=$3", [note, by, parseInt(id)]);
      const r = await query('SELECT * FROM tickets WHERE id=$1', [parseInt(id)]);
      return r.rows[0];
    },
    async deleteTicket(id) {
      await query('DELETE FROM tickets WHERE id=$1', [parseInt(id)]);
    },
    async editTicket(id, data) {
      await query('UPDATE tickets SET title=$1,identity_number=$2,request_number=$3,description=$4,updated_at=NOW() WHERE id=$5',
        [data.title, data.identity_number, data.request_number||'', data.description, parseInt(id)]);
    },
    async stats() {
      const r = await query("SELECT status, COUNT(*) as c FROM tickets GROUP BY status");
      const today = new Date().toISOString().slice(0,10);
      const todayR = await query("SELECT COUNT(*) as c FROM tickets WHERE created_at=$1", [today]);
      const total = await query("SELECT COUNT(*) as c FROM tickets");
      const s = { total: parseInt(total.rows[0].c), new: 0, review: 0, closed: 0, today: parseInt(todayR.rows[0].c) };
      r.rows.forEach(row => {
        if(row.status==='جديدة') s.new = parseInt(row.c);
        if(row.status==='قيد المراجعة') s.review = parseInt(row.c);
        if(row.status==='مغلقة') s.closed = parseInt(row.c);
      });
      return s;
    },

    // ── Notifications ────────────────────────────────────────
    async addNotif(user_id, ticket_id, ticket_title, message, type) {
      await query('INSERT INTO notifications (user_id,ticket_id,ticket_title,message,type) VALUES ($1,$2,$3,$4,$5)',
        [parseInt(user_id), parseInt(ticket_id), ticket_title, message, type||'info']);
    },
    async addNotifToRole(role, ticket_id, ticket_title, message, type) {
      const users = await query('SELECT id FROM users WHERE role=$1', [role]);
      for (const u of users.rows) {
        await query('INSERT INTO notifications (user_id,ticket_id,ticket_title,message,type) VALUES ($1,$2,$3,$4,$5)',
          [u.id, parseInt(ticket_id), ticket_title, message, type||'info']);
      }
    },
    async userNotifs(uid) {
      const r = await query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [parseInt(uid)]);
      return r.rows;
    },
    async markRead(uid) {
      await query('UPDATE notifications SET is_read=1 WHERE user_id=$1', [parseInt(uid)]);
    },

    // ── Comments ─────────────────────────────────────────────
    async getComments(ticket_id) {
      const r = await query('SELECT * FROM comments WHERE ticket_id=$1 ORDER BY id ASC', [parseInt(ticket_id)]);
      return r.rows;
    },
    async addComment(ticket_id, author, role, text) {
      const r = await query('INSERT INTO comments (ticket_id,author,role,text) VALUES ($1,$2,$3,$4) RETURNING *',
        [parseInt(ticket_id), author, role, text]);
      return r.rows[0];
    },

    // ── Attachments ──────────────────────────────────────────
    async getAttachments(ticket_id) {
      const r = await query('SELECT * FROM attachments WHERE ticket_id=$1 ORDER BY id ASC', [parseInt(ticket_id)]);
      return r.rows;
    },
    async addAttachment(ticket_id, data) {
      const r = await query('INSERT INTO attachments (ticket_id,filename,originalname,size,uploaded_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [parseInt(ticket_id), data.filename, data.originalname, data.size, data.uploadedBy]);
      return r.rows[0];
    },
    async deleteAttachment(ticket_id, fileId) {
      const r = await query('SELECT * FROM attachments WHERE id=$1 AND ticket_id=$2', [parseInt(fileId), parseInt(ticket_id)]);
      const att = r.rows[0];
      if (att) await query('DELETE FROM attachments WHERE id=$1', [parseInt(fileId)]);
      return att;
    },
  };

  return db;
}

module.exports = { initDB };
