const router = require('express').Router();
const { auth, role } = require('./middleware');
const { sendEmail, ticketEmail } = require('./mailer');

router.get('/stats', auth, role('advanced','dev','sysadmin','admin'), async (req, res) => {
  try { res.json(await req.app.locals.db.stats()); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/report', auth, role('sysadmin','admin'), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const all = await db.allTickets();
    const byStatus = {'جديدة':0,'قيد المراجعة':0,'مغلقة':0};
    all.forEach(t => { if(byStatus[t.status]!==undefined) byStatus[t.status]++; });
    const today = new Date().toISOString().slice(0,10);
    const byDate = {};
    all.forEach(t => {
      const d = (t.created_at||'').toString().slice(0,10);
      if(!byDate[d]) byDate[d]={total:0,new:0,closed:0};
      byDate[d].total++;
      if(t.status==='جديدة') byDate[d].new++;
      if(t.status==='مغلقة') byDate[d].closed++;
    });
    res.json({ total: all.length, byStatus, todayCount: all.filter(t=>(t.created_at||'').toString().slice(0,10)===today).length, tickets: all, byDate });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/', auth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const list = req.user.role==='support' ? await db.userTickets(req.user.id) : await db.allTickets();
    const enriched = await Promise.all(list.map(async t => ({
      ...t,
      _comments: (await db.getComments(t.id)).length,
      _attachments: (await db.getAttachments(t.id)).length,
    })));
    res.json(enriched);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

async function createTicket(req, res, force=false) {
  try {
    const { title, identity_number, request_number, description, priority } = req.body;
    if (!title || !identity_number || !description)
      return res.status(400).json({ error: 'رقم التذكرة ورقم الهوية والوصف مطلوبة' });
    const db = req.app.locals.db;

    if (!force) {
      const allT = await db.allTickets();
      const dupByTitle = allT.filter(t => t.title===title && t.status!=='مغلقة');
      const dupByIdentity = allT.filter(t => t.identity_number===identity_number && t.status!=='مغلقة');
      if (dupByTitle.length>0) return res.status(409).json({ error:'يوجد تذكرة مفتوحة بنفس رقم التذكرة', type:'duplicate_title', duplicates: dupByTitle.map(t=>({ticket_number:t.ticket_number,title:t.title,status:t.status,created_at:t.created_at})) });
      if (dupByIdentity.length>0) return res.status(409).json({ error:'يوجد تذاكر مفتوحة لنفس رقم الهوية / المنشأة', type:'duplicate_identity', duplicates: dupByIdentity.map(t=>({ticket_number:t.ticket_number,title:t.title,status:t.status,created_at:t.created_at})) });
    }

    const user = await db.findUserById(req.user.id);
    const t = await db.addTicket({ user_id:req.user.id, user_name:user.name, title, identity_number, request_number:request_number||'', description, priority:priority||'متوسطة' });

    const msg = `تذكرة جديدة من ${user.name}: ${title}`;
    await db.addNotifToRole('advanced', t.id, t.title, msg, 'new');
    await db.addNotifToRole('dev', t.id, t.title, msg, 'new');

    const advancedUsers = await db.getUsersByRole('advanced');
    for (const u of advancedUsers) {
      if (u.email) await sendEmail({ to: u.email, subject: `تذكرة جديدة: ${t.ticket_number}`, html: ticketEmail({ userName:u.name, ticketNumber:t.ticket_number, title:t.title, action:'new' }) });
    }
    res.status(201).json(t);
  } catch(e) { res.status(500).json({ error: e.message }); }
}

router.post('/', auth, role('support','advanced','sysadmin','admin'), (req,res) => createTicket(req,res,false));
router.post('/force', auth, role('support','advanced','sysadmin','admin'), (req,res) => createTicket(req,res,true));

router.patch('/:id/review', auth, role('advanced','sysadmin','admin'), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const t = await db.getTicket(req.params.id);
    if (!t) return res.status(404).json({ error:'التذكرة غير موجودة' });
    if (t.status!=='جديدة') return res.status(400).json({ error:'التذكرة ليست جديدة' });
    await db.setReview(req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/close', auth, role('advanced','dev','sysadmin','admin'), async (req, res) => {
  try {
    const { close_note } = req.body;
    if (!close_note) return res.status(400).json({ error:'ملاحظة الإغلاق مطلوبة' });
    const db = req.app.locals.db;
    const t = await db.getTicket(req.params.id);
    if (!t) return res.status(404).json({ error:'التذكرة غير موجودة' });
    if (t.status==='مغلقة') return res.status(400).json({ error:'مغلقة بالفعل' });
    await db.closeTicket(req.params.id, close_note, req.user.name);
    const closeMsg = `تم إغلاق التذكرة "${t.title}" بواسطة ${req.user.name}: ${close_note}`;
    if (['advanced','sysadmin','admin'].includes(req.user.role)) {
      await db.addNotif(t.user_id, t.id, t.title, `تم إغلاق تذكرتك "${t.title}" - ${close_note}`, 'closed');
    }
    if (['dev','sysadmin','admin'].includes(req.user.role)) {
      await db.addNotif(t.user_id, t.id, t.title, `تم إغلاق تذكرتك "${t.title}" - ${close_note}`, 'closed');
      await db.addNotifToRole('advanced', t.id, t.title, closeMsg, 'closed');
      if (req.user.role==='dev') await db.addNotifToRole('support', t.id, t.title, closeMsg, 'closed');
    }
    const owner = await db.findUserById(t.user_id);
    if (owner?.email) await sendEmail({ to: owner.email, subject: `إغلاق التذكرة: ${t.ticket_number}`, html: ticketEmail({ userName:owner.name, ticketNumber:t.ticket_number, title:t.title, action:'closed', note:close_note }) });
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', auth, role('dev','sysadmin','admin'), async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!await db.getTicket(req.params.id)) return res.status(404).json({ error:'التذكرة غير موجودة' });
    await db.deleteTicket(req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/edit', auth, role('support','advanced','dev','sysadmin','admin'), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { title, identity_number, request_number, description } = req.body;
    if (!title||!identity_number||!description) return res.status(400).json({ error:'جميع الحقول مطلوبة' });
    if (!await db.getTicket(req.params.id)) return res.status(404).json({ error:'التذكرة غير موجودة' });
    await db.editTicket(req.params.id, { title, identity_number, request_number:request_number||'', description });
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
