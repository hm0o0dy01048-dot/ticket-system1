const router = require('express').Router();
const { auth } = require('./middleware');
const { sendEmail, ticketEmail } = require('./mailer');

router.get('/:ticketId', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.ticketId);
    if (isNaN(id)) return res.status(400).json({ error: 'معرف غير صحيح' });
    res.json(await req.app.locals.db.getComments(id));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:ticketId', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.ticketId);
    if (isNaN(id)) return res.status(400).json({ error: 'معرف غير صحيح' });
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'نص التعليق مطلوب' });
    const db = req.app.locals.db;
    const t = await db.getTicket(id);
    if (!t) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    const c = await db.addComment(id, req.user.name, req.user.role, text.trim());
    const msg = `تعليق جديد من ${req.user.name}: ${text.trim().slice(0,60)}`;
    if (t.user_id !== req.user.id) await db.addNotif(t.user_id, id, t.title, msg, 'comment');
    for (const role of ['advanced','dev','support']) {
      if (role !== req.user.role) await db.addNotifToRole(role, id, t.title, msg, 'comment');
    }
    res.status(201).json(c);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
