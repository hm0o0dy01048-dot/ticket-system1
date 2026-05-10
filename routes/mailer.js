// Email disabled - log only
async function sendEmail({ to, subject, html }) {
  console.log(`📧 [Email disabled] To: ${to} | Subject: ${subject}`);
  return { skipped: true };
}

function ticketEmail({ userName, ticketNumber, title, action, note }) {
  return '';
}

module.exports = { sendEmail, ticketEmail };
