(function () {
  "use strict";
  if (!document.body || document.body.dataset.page !== "my-applications") return;

  var apps = [];
  var chatCtl = null;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function animFor(status) {
    if (status === "approved") return '<div class="success-check">✓</div>';
    if (status === "rejected") return '<div class="success-check denied">✕</div>';
    return "";
  }

  function renderList() {
    var mount = el("appsMount");
    if (!apps.length) {
      mount.innerHTML = '<div class="card text-center"><h2>' + I18n.t("myapps.title") + "</h2>" +
        '<p class="text-muted">' + I18n.t("myapps.empty") + '</p><a class="btn btn-primary" href="/my-schemes">' +
        I18n.t("details.back") + "</a></div>";
      return;
    }
    mount.innerHTML = '<h2 class="mb-4">' + I18n.t("myapps.title") + "</h2>" + apps.map(function (a) {
      return '<div class="card mb-3"><div class="flex items-center justify-between flex-wrap gap-2">' +
        "<div><strong>" + esc(a.scheme_name) + "</strong><br>" +
        '<span class="text-sm text-muted">' + esc(a.application_no) + " · " + esc(a.partner_name) + "</span></div>" +
        "<div>" + Chat.statusPill(a.status) + ' <button class="btn btn-secondary btn-sm" data-open="' + a.id + '">' +
        I18n.t("myapps.view") + "</button></div></div></div>";
    }).join("");
    mount.querySelectorAll("[data-open]").forEach(function (b) {
      b.addEventListener("click", function () { openDetail(parseInt(b.getAttribute("data-open"), 10)); });
    });
  }

  function openDetail(id) {
    var a = apps.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    if (chatCtl) { chatCtl.destroy(); chatCtl = null; }
    API.get("/api/applications/" + id, Auth.token())
      .then(function (full) {
        var mount = el("appsMount");
        var rows = Object.keys(full.documents || {}).map(function (k) {
          return '<p class="text-sm mb-1"><span class="text-muted">' + esc(k) + ":</span> <strong>" +
            esc(full.documents[k]) + "</strong></p>";
        }).join("");
        mount.innerHTML = '<button class="btn btn-ghost btn-sm mb-3" id="backBtn">← ' + I18n.t("common.back") + "</button>" +
          '<div class="card mb-4 text-center">' + animFor(full.status) +
          "<h2>" + esc(full.scheme_name) + "</h2>" +
          '<p class="text-muted">' + esc(full.application_no) + "</p><p>" + Chat.statusPill(full.status) + "</p></div>" +
          '<div class="card mb-4"><h3>' + I18n.t("myapps.details") + "</h3>" + rows + "</div>" +
          (full.status === "under_review"
            ? '<div class="card mb-4"><h3>' + I18n.t("chat.title") + "</h3>" +
              '<div class="chat-box" id="chatBox"></div>' +
              '<div class="flex gap-2"><input type="text" id="chatInput" placeholder="' +
              I18n.t("chat.placeholder") + '"><button class="btn btn-primary btn-sm" id="chatSend">' +
              I18n.t("chat.send") + "</button></div></div>"
            : "");
        el("backBtn").addEventListener("click", function () {
          if (chatCtl) { chatCtl.destroy(); chatCtl = null; }
          load();
        });
        if (full.status === "under_review") {
          chatCtl = Chat.mount({ appId: id, basePath: "/api/applications", mount: el("chatBox") });
          var sendIt = function () {
            var inp = el("chatInput");
            var v = inp.value.trim();
            if (!v) return;
            inp.value = "";
            chatCtl.send(v).catch(function (e) { Notify.error(e.message); });
          };
          el("chatSend").addEventListener("click", sendIt);
          el("chatInput").addEventListener("keydown", function (e) { if (e.key === "Enter") sendIt(); });
        }
      })
      .catch(function (e) { Notify.error(e.message); });
  }

  function load() {
    if (chatCtl) { chatCtl.destroy(); chatCtl = null; }
    var mount = el("appsMount");
    mount.innerHTML = '<div class="text-center py-4"><div class="spinner"></div></div>';
    API.get("/api/applications", Auth.token())
      .then(function (list) { apps = list || []; renderList(); })
      .catch(function (e) {
        mount.innerHTML = '<p class="text-muted">' + esc(e.message) + "</p>";
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!Auth.requireLogin()) return;
    load();
  });
})();
