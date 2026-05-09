const router = require('express').Router();
const { auth, role } = require('./middleware');
const { sendEmail, ticketEmail } = require('./mailer');

router.get('/stats', auth, role('advanced','dev','sysadmin','admin'), (req, res) => {
  res.json(req.app.locals.db.stats());
});

router.get('/report', auth, role('sysadmin','admin'), (req, res) => {
  const db = req.app.locals.db;
  const all = db.allTickets();
  const byStatus = {'جديدة':0,'قيد المراجعة':0,'مغلقة':0};
  all.forEach(t => { if(byStatus[t.status]!==undefined) byStatus[t.status]++; });
  const today = new Date().toISOString().slice(0,10);
  // Group by date for chart
  const byDate = {};
  all.forEach(t => {
    const d = t.created_at||today;
    if (!byDate[d]) byDate[d] = {total:0,new:0,closed:0};
    byDate[d].total++;
    if(t.status==='جديدة') byDate[d].new++;
    if(t.status==='مغلقة') byDate[d].closed++;
  });
  res.json({ total: all.length, byStatus, todayCount: all.filter(t=>t.created_at===today).length, tickets: all, byDate });
});

router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const list = req.user.role==='support' ? db.userTickets(req.user.id) : db.allTickets();
  const enriched = list.map(t => ({
    ...t,
    _comments: db.getComments(t.id).length,
    _attachments: db.getAttachments(t.id).length,
  }));
  res.json(enriched);
});

async function createTicket(req, res, force=false) {
  const { title, identity_number, request_number, description } = req.body;
  if (!title || !identity_number || !description)
    return res.status(400).json({ error: 'رقم التذكرة ورقم الهوية والوصف مطلوبة' });
  const db = req.app.locals.db;

  if (!force) {
    const allT = db.allTickets();
    const dupByTitle = allT.filter(t => t.title===title && t.status!=='مغلقة');
    const dupByIdentity = allT.filter(t => t.identity_number===identity_number && t.status!=='مغلقة');
    if (dupByTitle.length>0) return res.status(409).json({ error:'يوجد تذكرة مفتوحة بنفس رقم التذكرة', type:'duplicate_title', duplicates: dupByTitle.map(t=>({ticket_number:t.ticket_number,title:t.title,status:t.status,created_at:t.created_at})) });
    if (dupByIdentity.length>0) return res.status(409).json({ error:'يوجد تذاكر مفتوحة لنفس رقم الهوية / المنشأة', type:'duplicate_identity', duplicates: dupByIdentity.map(t=>({ticket_number:t.ticket_number,title:t.title,status:t.status,created_at:t.created_at})) });
  }

  const user = db.findUserById(req.user.id);
  const t = db.addTicket({ user_id:req.user.id, user_name:user.name, title, identity_number, request_number:request_number||'', description });

  const msg = `تذكرة جديدة من ${user.name}: ${title}`;
  db.addNotifToRole('advanced', t.id, t.title, msg, 'new');
  db.addNotifToRole('dev', t.id, t.title, msg, 'new');

  // Email notification to advanced team
  const advancedUsers = db.getUsersByRole('advanced');
  for (const u of advancedUsers) {
    if (u.email) {
      await sendEmail({ to: u.email, subject: `تذكرة جديدة: ${t.ticket_number}`,
        html: ticketEmail({ userName:u.name, ticketNumber:t.ticket_number, title:t.title, action:'new' }) });
    }
  }
  res.status(201).json(t);
}

router.post('/', auth, role('support','advanced','sysadmin','admin'), (req,res) => createTicket(req,res,false));
router.post('/force', auth, role('support','advanced','sysadmin','admin'), (req,res) => createTicket(req,res,true));

router.patch('/:id/review', auth, role('advanced','sysadmin','admin'), (req, res) => {
  const db = req.app.locals.db;
  const t = db.getTicket(req.params.id);
  if (!t) return res.status(404).json({ error:'التذكرة غير موجودة' });
  if (t.status!=='جديدة') return res.status(400).json({ error:'التذكرة ليست جديدة' });
  db.setReview(req.params.id);
  res.json({ ok:true });
});

router.patch('/:id/close', auth, role('advanced','dev','sysadmin','admin'), async (req, res) => {
  const { close_note } = req.body;
  if (!close_note) return res.status(400).json({ error:'ملاحظة الإغلاق مطلوبة' });
  const db = req.app.locals.db;
  const t = db.getTicket(req.params.id);
  if (!t) return res.status(404).json({ error:'التذكرة غير موجودة' });
  if (t.status==='مغلقة') return res.status(400).json({ error:'مغلقة بالفعل' });
  db.closeTicket(req.params.id, close_note, req.user.name);

  const closeMsg = `تم إغلاق التذكرة "${t.title}" بواسطة ${req.user.name}: ${close_note}`;

  if (['advanced','sysadmin','admin'].includes(req.user.role)) {
    db.addNotif(t.user_id, t.id, t.title, `تم إغلاق تذكرتك "${t.title}" - ${close_note}`, 'closed');
  }
  if (['dev','sysadmin','admin'].includes(req.user.role)) {
    db.addNotif(t.user_id, t.id, t.title, `تم إغلاق تذكرتك "${t.title}" - ${close_note}`, 'closed');
    db.addNotifToRole('advanced', t.id, t.title, closeMsg, 'closed');
    if (req.user.role==='dev') db.addNotifToRole('support', t.id, t.title, closeMsg, 'closed');
  }

  // Email to ticket owner
  const owner = db.findUserById(t.user_id);
  if (owner?.email) {
    await sendEmail({ to: owner.email, subject: `إغلاق التذكرة: ${t.ticket_number}`,
      html: ticketEmail({ userName:owner.name, ticketNumber:t.ticket_number, title:t.title, action:'closed', note:close_note }) });
  }
  res.json({ ok:true });
});

router.delete('/:id', auth, role('dev','sysadmin','admin'), (req, res) => {
  const db = req.app.locals.db;
  if (!db.getTicket(req.params.id)) return res.status(404).json({ error:'التذكرة غير موجودة' });
  db.deleteTicket(req.params.id);
  res.json({ ok:true });
});

router.patch('/:id/edit', auth, role('support','advanced','dev','sysadmin','admin'), (req, res) => {
  const db = req.app.locals.db;
  const { title, identity_number, request_number, description } = req.body;
  if (!title||!identity_number||!description) return res.status(400).json({ error:'جميع الحقول مطلوبة' });
  const t = db.getTicket(req.params.id);
  if (!t) return res.status(404).json({ error:'التذكرة غير موجودة' });
  db.editTicket(req.params.id, { title, identity_number, request_number:request_number||'', description });
  res.json({ ok:true });
});

module.exports = router;
