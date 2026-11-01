/* Budget Tracker receipt service. Deploy as owner; application checks every request. */
const CLIENT_ID =
  "596898834710-uimpamt17opolc3u06n78i6t9vhq0efj.apps.googleusercontent.com";
const PEOPLE = ["ramasami.official@gmail.com", "tnvarsha.99@gmail.com"];
const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const LIMIT = 5 * 1024 * 1024;
function doGet() {
  return json_({ ok: true, service: "budget-receipts", version: 1 });
}
function doPost(e) {
  try {
    if (!e || !e.postData || e.postData.contents.length > 16384)
      throw Error("Invalid request.");
    const req = JSON.parse(e.postData.contents);
    const actor = authenticate_(req.token);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw Error("Receipt service is busy. Retry.");
    try {
      return json_({ ok: true, result: dispatch_(req, actor) });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return json_({
      ok: false,
      error: String(error.message || "Receipt request failed."),
    });
  }
}
function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
function authenticate_(token) {
  if (typeof token !== "string" || token.length < 10 || token.length > 4096)
    throw Error("Sign in again.");
  const infoResponse = UrlFetchApp.fetch(
    "https://oauth2.googleapis.com/tokeninfo?access_token=" +
      encodeURIComponent(token),
    { muteHttpExceptions: true },
  );
  if (infoResponse.getResponseCode() !== 200)
    throw Error("Google session expired. Sign in again.");
  const info = JSON.parse(infoResponse.getContentText());
  if (
    (info.aud || info.issued_to) !== CLIENT_ID ||
    Number(info.expires_in) <= 0
  )
    throw Error("Invalid Google application session.");
  const profileResponse = UrlFetchApp.fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    { headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true },
  );
  if (profileResponse.getResponseCode() !== 200)
    throw Error("Google account verification failed.");
  const profile = JSON.parse(profileResponse.getContentText());
  const email = String(profile.email || "").toLowerCase();
  if (profile.email_verified !== true || PEOPLE.indexOf(email) < 0)
    throw Error("This Google account is not authorized.");
  return email;
}
function setup() {
  if (Session.getEffectiveUser().getEmail().toLowerCase() !== PEOPLE[0])
    throw Error("Deploy this service from Ram’s account.");
  const props = PropertiesService.getScriptProperties();
  let folder;
  if (props.getProperty("RECEIPT_FOLDER"))
    folder = DriveApp.getFolderById(props.getProperty("RECEIPT_FOLDER"));
  else {
    folder = DriveApp.createFolder("Budget Tracker — Shared Receipts");
    props.setProperty("RECEIPT_FOLDER", folder.getId());
  }
  const permissions =
    JSON.parse(
      drive_(
        "drive/v3/files/" +
          folder.getId() +
          "/permissions?fields=permissions(emailAddress)",
      ).getContentText(),
    ).permissions || [];
  if (
    !permissions.some(
      (p) => String(p.emailAddress || "").toLowerCase() === PEOPLE[1],
    )
  ) {
    drive_(
      "drive/v3/files/" +
        folder.getId() +
        "/permissions?sendNotificationEmail=false",
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          type: "user",
          role: "reader",
          emailAddress: PEOPLE[1],
        }),
      },
    );
  }
  return { folderId: folder.getId() };
}
function folder_() {
  const id =
    PropertiesService.getScriptProperties().getProperty("RECEIPT_FOLDER");
  if (!id) throw Error("Receipt service setup is incomplete.");
  return id;
}
function drive_(path, options) {
  options = options || {};
  options.headers = Object.assign({}, options.headers, {
    Authorization: "Bearer " + ScriptApp.getOAuthToken(),
  });
  options.muteHttpExceptions = true;
  const response = UrlFetchApp.fetch(
    "https://www.googleapis.com/" + path,
    options,
  );
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300)
    throw Error(
      "Google Drive did not confirm the receipt operation (" +
        response.getResponseCode() +
        ").",
    );
  return response;
}
function id_(id) {
  if (typeof id !== "string" || !/^[\w-]{5,200}$/.test(id))
    throw Error("Invalid receipt ID.");
  return id;
}
function managed_(id) {
  const file = JSON.parse(
    drive_(
      "drive/v3/files/" +
        id_(id) +
        "?fields=id,name,mimeType,size,createdTime,trashed,parents,appProperties",
    ).getContentText(),
  );
  if (
    !file.parents ||
    file.parents.indexOf(folder_()) < 0 ||
    (file.appProperties || {}).budgetService !== "v1"
  )
    throw Error("This file is not a shared Budget Tracker receipt.");
  return file;
}
function receipt_(file) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: Number(file.size),
    uploadedAt: file.createdTime,
    storage: "shared-v1",
  };
}
function origin_(origin) {
  if (
    ![
      "https://ramasami.github.io",
      "http://127.0.0.1:3000",
      "http://localhost:3000",
      "http://127.0.0.1:4173",
    ].includes(origin)
  )
    throw Error("Unsupported app origin.");
  return origin;
}
function dispatch_(req, actor) {
  if (req.action === "beginUpload") {
    if (
      typeof req.key !== "string" ||
      !/^[\w-]{1,200}$/.test(req.key) ||
      typeof req.name !== "string" ||
      !req.name.trim() ||
      req.name.length > 240 ||
      TYPES.indexOf(req.mimeType) < 0 ||
      !Number.isInteger(req.size) ||
      req.size <= 0 ||
      req.size > LIMIT
    )
      throw Error("Invalid receipt upload.");
    const q =
      "'" +
      folder_() +
      "' in parents and trashed=false and appProperties has {key='budgetReceipt' and value='" +
      req.key +
      "'}";
    const existing = JSON.parse(
      drive_(
        "drive/v3/files?q=" +
          encodeURIComponent(q) +
          "&fields=files(id,name,mimeType,size,createdTime)&pageSize=1",
      ).getContentText(),
    ).files;
    if (existing.length) return { receipt: receipt_(existing[0]) };
    const response = drive_(
      "upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,createdTime",
      {
        method: "post",
        contentType: "application/json",
        headers: {
          "X-Upload-Content-Type": req.mimeType,
          "X-Upload-Content-Length": String(req.size),
          Origin: origin_(req.origin),
        },
        payload: JSON.stringify({
          name: req.name,
          mimeType: req.mimeType,
          parents: [folder_()],
          appProperties: {
            budgetService: "v1",
            budgetReceipt: req.key,
            uploadedBy: actor,
          },
        }),
      },
    );
    const headers = response.getAllHeaders();
    const uploadUrl = headers.Location || headers.location;
    if (
      !uploadUrl ||
      !/^https:\/\/www\.googleapis\.com\/upload\//.test(uploadUrl)
    )
      throw Error("Google Drive did not create an upload session.");
    return { uploadUrl: uploadUrl };
  }
  const file = managed_(req.id);
  if (req.action === "info")
    return { available: true, trashed: file.trashed === true, canTrash: true };
  if (req.action === "finishUpload") {
    if (
      file.trashed ||
      Number(file.size) <= 0 ||
      Number(file.size) > LIMIT ||
      TYPES.indexOf(file.mimeType) < 0
    )
      throw Error("Google Drive did not confirm a valid receipt.");
    return receipt_(file);
  }
  if (req.action === "trash" || req.action === "restore") {
    const trashed = req.action === "trash";
    const updated = JSON.parse(
      drive_("drive/v3/files/" + file.id + "?fields=id,trashed", {
        method: "patch",
        contentType: "application/json",
        payload: JSON.stringify({ trashed: trashed }),
      }).getContentText(),
    );
    if (updated.id !== file.id || updated.trashed !== trashed)
      throw Error("Google Drive did not confirm deletion/restoration.");
    return { id: updated.id, trashed: updated.trashed };
  }
  if (req.action === "download") {
    if (
      file.trashed ||
      Number(file.size) > LIMIT ||
      TYPES.indexOf(file.mimeType) < 0
    )
      throw Error("Receipt is unavailable.");
    const response = drive_("drive/v3/files/" + file.id + "?alt=media");
    return {
      mimeType: file.mimeType,
      data: Utilities.base64Encode(response.getContent()),
      size: Number(file.size),
    };
  }
  throw Error("Unknown receipt operation.");
}
