let swRegistration = null;
let currentSubscription = null;
let vapidPublicKey = null;

const statusPermission = document.getElementById('statusPermission');
const statusPush = document.getElementById('statusPush');
const btnSubscribe = document.getElementById('btnSubscribe');
const btnUnsubscribe = document.getElementById('btnUnsubscribe');
const notificationLog = document.getElementById('notificationLog');

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function showLog(message, type = 'info') {
  notificationLog.style.display = 'block';
  notificationLog.className = `log-box log-${type}`;
  notificationLog.innerHTML = message;
}

function updateUI() {
  const isSupported = typeof window !== 'undefined' && 'Notification' in window;
  const permission = isSupported ? Notification.permission : 'Not Supported';
  statusPermission.textContent = permission;

  if (!isSupported) {
    statusPush.textContent = 'Blocked (Requires HTTPS)';
    btnSubscribe.textContent = 'Notifications Not Supported on HTTP';
    btnSubscribe.disabled = true;
    showLog('⚠️ Mobile browsers block Notifications on plain HTTP (192.168.x.x). To test on mobile, an HTTPS connection is required.', 'error');
    return;
  }

  if (currentSubscription) {
    statusPush.textContent = 'Active (Subscribed)';
    btnSubscribe.textContent = 'Subscribed';
    btnSubscribe.disabled = true;
    btnUnsubscribe.style.display = 'inline-flex';
  } else {
    statusPush.textContent = 'Not Subscribed';
    btnSubscribe.textContent = 'Allow Notifications';
    btnSubscribe.disabled = false;
    btnUnsubscribe.style.display = 'none';
  }
}

async function initServiceWorker() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showLog('Push notifications are not supported in this browser.', 'error');
    return;
  }

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    currentSubscription = await swRegistration.pushManager.getSubscription();
    if (currentSubscription) {
      await syncSubscription(currentSubscription);
    }
    updateUI();
  } catch (err) {
    console.error('Service worker error:', err);
  }
}

async function syncSubscription(sub) {
  try {
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    });
  } catch (err) {
    console.error('Failed to sync subscription:', err);
  }
}

async function subscribeUser() {
  try {
    btnSubscribe.disabled = true;

    if (!('Notification' in window)) {
      showLog('Notification API is not available on this mobile browser over HTTP. HTTPS is required.', 'error');
      btnSubscribe.disabled = false;
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showLog('Permission was not granted.', 'error');
      updateUI();
      return;
    }

    if (!swRegistration) {
      swRegistration = await navigator.serviceWorker.register('/sw.js');
    }
    await navigator.serviceWorker.ready;

    if (!vapidPublicKey) {
      const res = await fetch('/api/vapid-public-key');
      const data = await res.json();
      vapidPublicKey = data.publicKey;
    }

    currentSubscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });

    await syncSubscription(currentSubscription);
    showLog('Notifications enabled! You can now close this tab and send from /admin.', 'success');
    updateUI();
  } catch (err) {
    showLog(`Subscription error: ${err.message}`, 'error');
    btnSubscribe.disabled = false;
  }
}

async function unsubscribeUser() {
  if (!currentSubscription) return;

  try {
    const endpoint = currentSubscription.endpoint;
    await currentSubscription.unsubscribe();
    currentSubscription = null;

    await fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint })
    });

    showLog('Unsubscribed.', 'info');
    updateUI();
  } catch (err) {
    showLog(`Unsubscribe error: ${err.message}`, 'error');
  }
}

btnSubscribe.addEventListener('click', subscribeUser);
btnUnsubscribe.addEventListener('click', unsubscribeUser);

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/vapid-public-key');
    const data = await res.json();
    vapidPublicKey = data.publicKey;
  } catch (e) {}

  await initServiceWorker();
  updateUI();
});
