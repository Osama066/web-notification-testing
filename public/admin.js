const adminSubCount = document.getElementById('adminSubCount');
const adminForm = document.getElementById('adminForm');
const btnAdminSend = document.getElementById('btnAdminSend');
const adminLog = document.getElementById('adminLog');

function showLog(message, type = 'info') {
  adminLog.style.display = 'block';
  adminLog.className = `log-box log-${type}`;
  adminLog.innerHTML = message;
}

async function loadSubscribers() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    adminSubCount.textContent = `${data.subscribersCount} device(s)`;
  } catch (err) {
    adminSubCount.textContent = 'Error connecting to server';
  }
}

adminForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('adminTitle').value.trim();
  const body = document.getElementById('adminBody').value.trim();
  const url = document.getElementById('adminUrl').value.trim();

  btnAdminSend.disabled = true;
  btnAdminSend.textContent = 'Sending...';

  try {
    const res = await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, url, delaySeconds: 0 })
    });

    const data = await res.json();

    if (data.success) {
      showLog(`Notification sent to ${data.sent} device(s)!`, 'success');
    } else {
      showLog(`Could not send: ${data.reason || 'No devices currently subscribed. Open the user page first and allow notifications.'}`, 'error');
    }
  } catch (err) {
    showLog(`Failed to send: ${err.message}`, 'error');
  } finally {
    btnAdminSend.disabled = false;
    btnAdminSend.textContent = 'Send Notification Now';
    loadSubscribers();
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const adminUrl = document.getElementById('adminUrl');
  if (adminUrl) {
    adminUrl.value = window.location.origin;
  }
  loadSubscribers();
});
setInterval(loadSubscribers, 3000);
