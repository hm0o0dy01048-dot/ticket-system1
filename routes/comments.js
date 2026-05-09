const router = require('express').Router();
const { auth } = require('./middleware');
const { sendEmail, ticketEmail } = require('./mailer');

router.get('/:ticketId', auth, (req, res) => {
  res.json(req.app.locals.db.getComments(req.params.ticketId));
});

router.post('/:ticketId', auth, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error:'نص التعليق مطلوب' });
  const db = req.app.locals.db;
  const t = db.getTicket(req.params.ticketId);
  if (!t) return res.status(404).json({ error:'التذكرة غير موجودة' });
  const c = db.addComment(req.params.ticketId, req.user.name, req.user.role, text.trim());

  const msg = `تعليق جديد من ${req.user.name} على التذكرة: ${text.trim().slice(0,60)}`;
  if (t.user_id !== req.user.id) db.addNotif(t.user_id, t.id, t.title, msg, 'comment');
  ['advanced','dev','support'].forEach(role => {
    if (role !== req.user.role) db.addNotifToRole(role, t.id, t.title, msg, 'comment');
  });

  // Email to ticket owner
  const owner = db.findUserById ? db.findUserById(t.user_id) : null;
  if (owner?.email && owner.id !== req.user.id) {
    await sendEmail({ to: owner.email, subject: `تعليق جديد: ${t.ticket_number}`,
      html: ticketEmail({ userName:owner.name, ticketNumber:t.ticket_number, title:t.title, action:'comment', note:text.trim().slice(0,100) }) });
  }
  res.status(201).json(c);
});

module.exports = router;
