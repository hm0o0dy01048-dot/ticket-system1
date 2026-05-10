require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

async function sendEmail({ to, subject, html }) {
  if (!process.env.SMTP_USER) {
    console.log(`📧 [Email skipped - no SMTP config] To: ${to}`);
    return { skipped: true };
  }
  try {
    const info = await transporter.sendMail({
      from: `"نظام التذاكر" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to, subject, html,
    });
    console.log(`📧 Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('Email error:', err.message);
    return { error: err.message };
  }
}

function ticketEmail({ userName, ticketNumber, title, action, note }) {
  const actionText = {
    new: 'تم إنشاء تذكرة جديدة',
    closed: 'تم إغلاق التذكرة',
    comment: 'تعليق جديد على التذكرة',
    review: 'التذكرة قيد المراجعة',
  }[action] || action;

  return `
  <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;padding:20px;border-radius:12px">
    <div style="background:#1B6B1B;padding:20px;border-radius:8px;text-align:center;margin-bottom:20px">
      <h1 style="color:#fff;margin:0;font-size:20px">🎫 نظام التذاكر</h1>
    </div>
    <div style="background:#fff;padding:20px;border-radius:8px;border:1px solid #ddd">
      <h2 style="color:#1B6B1B;margin-top:0">${actionText}</h2>
      <p>مرحباً <strong>${userName}</strong>،</p>
      <div style="background:#f0f7f0;padding:14px;border-radius:8px;border-right:4px solid #1B6B1B;margin:14px 0">
        <div><strong>رقم التذكرة:</strong> ${ticketNumber}</div>
        <div style="margin-top:6px"><strong>العنوان:</strong> ${title}</div>
        ${note ? `<div style="margin-top:6px"><strong>ملاحظة:</strong> ${note}</div>` : ''}
      </div>
    </div>
    <p style="text-align:center;color:#999;font-size:12px;margin-top:16px">نظام تذاكر الدعم الفني</p>
  </div>`;
}

module.exports = { sendEmail, ticketEmail };
