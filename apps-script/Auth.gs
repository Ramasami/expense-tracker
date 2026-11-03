/* Remembered devices: refresh credentials never leave Script properties. */
const DEVICE_PREFIX = "AUTH_DEVICE:";
const DEVICE_TTL = 30 * 24 * 60 * 60 * 1000;
function authError_(code, message) { const error = Error(message); error.code = code; return error; }
function authTemporary_() { return authError_("SESSION_TEMPORARY", "Google could not renew your session. Your remembered login is kept; reconnect and retry."); }
function authStatus_(actor) {
  return { configured: !!PropertiesService.getScriptProperties().getProperty("GOOGLE_OAUTH_CLIENT_SECRET"), canConfigure: actor === PEOPLE[0] };
}
function configureAuth_(req, actor) {
  if (actor !== PEOPLE[0]) throw Error("Only the service owner can configure remembered login.");
  if (typeof req.clientSecret !== "string" || !/^[A-Za-z0-9._-]{12,256}$/.test(req.clientSecret.trim())) throw Error("Enter the Google Web OAuth client secret.");
  PropertiesService.getScriptProperties().setProperty("GOOGLE_OAUTH_CLIENT_SECRET", req.clientSecret.trim());
  return authStatus_(actor);
}
function deviceKey_(credential) {
  if (typeof credential !== "string" || !/^[a-f0-9]{96}$/.test(credential)) throw authError_("SESSION_EXPIRED", "Remembered login expired. Sign in again.");
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, credential, Utilities.Charset.UTF_8);
  return DEVICE_PREFIX + bytes.map((n) => (n & 255).toString(16).padStart(2, "0")).join("");
}
function googleAuthTokens_(payload) {
  const secret = PropertiesService.getScriptProperties().getProperty("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!secret) throw authError_("SESSION_SETUP", "Remembered login needs one-time setup in Settings.");
  let response;
  try { response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", { method: "post", payload: Object.assign({client_id: CLIENT_ID, client_secret: secret}, payload), muteHttpExceptions: true }); }
  catch (_) { throw authTemporary_(); }
  const status = response.getResponseCode();
  if (status === 429 || status >= 500) throw authTemporary_();
  if (status !== 200) {
    let failure = {};
    try { failure = JSON.parse(response.getContentText()); } catch (_) {}
    if (failure.error === "invalid_client") throw authError_("SESSION_SETUP", "The Google OAuth client secret needs correction in Settings.");
    throw authError_("SESSION_EXPIRED", "Google authorization expired or was revoked. Sign in again and remember this device.");
  }
  let data; try { data = JSON.parse(response.getContentText()); } catch (_) { throw authTemporary_(); }
  if (typeof data.access_token !== "string" || data.access_token.length < 10 || data.access_token.length > 4096 || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) < 60 || Number(data.expires_in) > 86400) throw authTemporary_();
  return data;
}
function createDevice_(req, actor) {
  const origins = ["https://ramasami.github.io", "http://localhost:3000", "http://127.0.0.1:3000", "http://127.0.0.1:4173"];
  if (origins.indexOf(req.origin) < 0 || typeof req.code !== "string" || req.code.length < 10 || req.code.length > 4096) throw Error("Invalid remembered-login request.");
  // Enrollment already requires a verified Google bearer credential; this is not a cookie-authenticated endpoint.
  const tokens = googleAuthTokens_({code: req.code, grant_type: "authorization_code", redirect_uri: req.origin});
  const verified = authenticate_(tokens.access_token);
  if (verified !== actor) throw Error("Choose the same Google account that is signed in to Budget Tracker.");
  if (typeof tokens.refresh_token !== "string" || tokens.refresh_token.length < 10 || tokens.refresh_token.length > 4096) throw Error("Google did not grant offline access. Reconnect this app in Google account permissions, then try remembering this device again.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw authTemporary_();
  try {
    const props = PropertiesService.getScriptProperties(), now = Date.now();
    const existing = props.getProperties(), devices = [];
    Object.keys(existing).filter((key) => key.indexOf(DEVICE_PREFIX) === 0).forEach((key) => {
      let device; try { device = JSON.parse(existing[key]); } catch (_) { props.deleteProperty(key); return; }
      if (device.until <= now) props.deleteProperty(key);
      else if (device.actor === actor) devices.push({key: key, created: device.created});
    });
    devices.sort((a,b) => a.created - b.created);
    while (devices.length >= 5) props.deleteProperty(devices.shift().key);
    const credential = (Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").toLowerCase();
    const device = {actor: actor, created: now, until: now + DEVICE_TTL, accessToken: tokens.access_token, expiresAt: now + Number(tokens.expires_in) * 1000, refreshToken: tokens.refresh_token};
    props.setProperty(deviceKey_(credential), JSON.stringify(device));
    return { deviceToken: credential, rememberedUntil: device.until, accessToken: device.accessToken, expiresAt: device.expiresAt, email: actor };
  } finally { lock.releaseLock(); }
}
function restoreDevice_(req) {
  const key = deviceKey_(req.deviceToken), lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw authTemporary_();
  try {
    const props = PropertiesService.getScriptProperties(), raw = props.getProperty(key);
    if (!raw) throw authError_("SESSION_EXPIRED", "Remembered login ended. Sign in again.");
    let device; try { device = JSON.parse(raw); } catch (_) { props.deleteProperty(key); throw authError_("SESSION_EXPIRED", "Remembered login ended. Sign in again."); }
    if (!device.actor || !Number.isFinite(device.until) || device.until <= Date.now()) {
      props.deleteProperty(key);
      throw authError_("SESSION_EXPIRED", "Your 30-day remembered login expired. Sign in again.");
    }
    try {
      if (device.expiresAt <= Date.now() + 90000) {
        const tokens = googleAuthTokens_({refresh_token: device.refreshToken, grant_type: "refresh_token"});
        device.accessToken = tokens.access_token;
        device.expiresAt = Date.now() + Number(tokens.expires_in) * 1000;
        if (tokens.refresh_token) {
          if (typeof tokens.refresh_token !== "string" || tokens.refresh_token.length > 4096) throw authTemporary_();
          device.refreshToken = tokens.refresh_token;
        }
      }
      // Recheck active owner membership and actual Sheet access on every restore/renewal.
      const actor = authenticate_(device.accessToken);
      if (actor !== device.actor) throw Error("Google account changed. Sign in again.");
      props.setProperty(key, JSON.stringify(device));
      return { accessToken: device.accessToken, expiresAt: device.expiresAt, rememberedUntil: device.until, email: actor };
    } catch (error) {
      if (error.code === "SESSION_TEMPORARY" || error.code === "SESSION_SETUP") throw error;
      props.deleteProperty(key);
      throw authError_("SESSION_EXPIRED", "Google access or owner permission changed. Sign in again.");
    }
  } finally { lock.releaseLock(); }
}
function revokeDevice_(req) {
  const key = deviceKey_(req.deviceToken), lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw authTemporary_();
  try { PropertiesService.getScriptProperties().deleteProperty(key); return {revoked: true}; }
  finally { lock.releaseLock(); }
}
