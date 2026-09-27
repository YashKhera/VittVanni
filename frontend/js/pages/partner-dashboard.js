(function () {
  "use strict";
  if (!document.body || document.body.dataset.page !== "partner-dashboard") return;

  var tab = "schemes";
  var schemes = [];
  var allSchemes = [];
  var inbox = [];
  var chatCtl = null;
  var profileLocked = false;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function api(path, opts) {
    opts = opts || {};
    opts.skipAuthRedirect = true;
    return API.get("/api/partner" + path, Auth.token(), opts);
  }

  function guard() {
    if (!Auth.requireLogin()) return false;
    var u = Auth.user();
    if (!u || u.role !== "partner") {
      window.location.href = "/home";
      return false;
    }
    return true;
  }

  function tabsHtml() {
    var tabs = [["schemes", "partner.tab.schemes"], ["inbox", "partner.tab.inbox"], ["profile", "partner.tab.profile"]];
    return '<div class="flex gap-2 mb-4">' + tabs.map(function (t) {
      return '<button class="btn btn-sm flex-1 ' + (tab === t[0] ? "btn-secondary" : "btn-ghost") +
        '" data-tab="' + t[0] + '">' + I18n.t(t[1]) + "</button>";
    }).join("") + "</div>";
  }

  function wireTabs() {
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () {
        var next = b.getAttribute("data-tab");
        if (profileLocked && next !== "profile") {
          Notify.warning(I18n.t("partner.profile.incomplete"));
          return;
        }
        if (chatCtl) { chatCtl.destroy(); chatCtl = null; }
        tab = next;
        render();
      });
    });
  }

  function profileComplete(p) {
    return !!(p && p.org_name && p.phone && p.state && p.city);
  }

  function render() {
    var mount = el("partnerMount");
    mount.innerHTML = '<h2 class="mb-4">' + I18n.t("partner.title") + "</h2>" +
      (profileLocked ? '<div class="card mb-4"><p class="mb-0">' + I18n.t("partner.profile.incomplete") + "</p></div>" : "") +
      tabsHtml() + '<div id="tabBody"></div>';
    wireTabs();
    if (profileLocked) { renderProfile(); return; }
    if (tab === "schemes") renderSchemes();
    else if (tab === "inbox") renderInbox();
    else renderProfile();
  }

  function renderSchemes() {
    var body = el("tabBody");
    body.innerHTML = '<div class="text-center py-4"><div class="spinner"></div></div>';
    api("/schemes").then(function (mine) {
      schemes = mine || [];
      var chosen = {};
      schemes.forEach(function (s) { chosen[s.scheme_id] = true; });
      return API.get("/api/schemes?limit=200", Auth.token(), { skipAuthRedirect: true }).then(function (all) {
        allSchemes = (all && (all.schemes || all)) || [];
        var list = Array.isArray(allSchemes) ? allSchemes : [];
        body.innerHTML = '<div class="card mb-4"><h3>' + I18n.t("partner.schemes.pick") + "</h3>" +
          '<div style="max-height:300px;overflow-y:auto">' + list.map(function (s) {
            var id = s.id || s.scheme_id;
            return '<label class="partner-pick"><input type="checkbox" data-scheme="' + id + '"' +
              (chosen[id] ? " checked" : "") + "><span><strong>" + esc(s.name || s.scheme_name) + "</strong></span></label>";
          }).join("") + "</div>" +
          '<button class="btn btn-primary btn-block mt-3" id="saveSchemesBtn">' + I18n.t("common.save") + "</button></div>" +
          '<h3 class="mb-3">' + I18n.t("partner.schemes.mine") + "</h3>" +
          (schemes.length ? schemes.map(function (s) {
            return '<div class="card mb-3"><div class="flex items-center justify-between flex-wrap gap-2"><div><strong>' +
              esc(s.scheme_name) + "</strong><br>" +
              '<span class="text-sm text-muted">' + I18n.t("partner.beneficiaries", { n: s.approved }) +
              " · " + I18n.t("partner.inboxCount", { n: s.submitted + s.under_review }) + "</span></div>" +
              '<button class="btn btn-secondary btn-sm" data-view-scheme="' + s.scheme_id + '">' +
              I18n.t("partner.viewApps") + "</button></div></div>";
          }).join("") : '<p class="text-muted">' + I18n.t("partner.schemes.none") + "</p>");
        el("saveSchemesBtn").addEventListener("click", function () {
          var ids = [];
          body.querySelectorAll("[data-scheme]:checked").forEach(function (c) {
            ids.push(parseInt(c.getAttribute("data-scheme"), 10));
          });
          API.put("/api/partner/schemes", { scheme_ids: ids }, Auth.token())
            .then(function (upd) { schemes = upd || []; render(); Notify.success(I18n.t("common.saved")); })
            .catch(function (e) { Notify.error(e.message); });
        });
        body.querySelectorAll("[data-view-scheme]").forEach(function (b) {
          b.addEventListener("click", function () {
            tab = "inbox";
            render();
            loadInbox(parseInt(b.getAttribute("data-view-scheme"), 10));
          });
        });
      });
    }).catch(function (e) { body.innerHTML = '<p class="text-muted">' + esc(e.message) + "</p>"; });
  }

  function loadInbox(schemeId) {
    var body = el("tabBody");
    body.innerHTML = '<div class="text-center py-4"><div class="spinner"></div></div>';
    api("/applications" + (schemeId ? "?scheme_id=" + schemeId : "")).then(function (list) {
      inbox = list || [];
      if (!inbox.length) {
        body.innerHTML = tabsHtml() + '<p class="text-muted">' + I18n.t("partner.inbox.empty") + "</p>";
        wireTabs();
        return;
      }
      body.innerHTML = tabsHtml() + inbox.map(function (a) {
        return '<div class="card mb-3"><div class="flex items-center justify-between flex-wrap gap-2"><div><strong>' +
          esc(a.scheme_name) + "</strong><br>" +
          '<span class="text-sm text-muted">' + esc(a.application_no) + "</span></div><div>" +
          Chat.statusPill(a.status) + ' <button class="btn btn-secondary btn-sm" data-app="' + a.id + '">' +
          I18n.t("partner.review") + "</button></div></div></div>";
      }).join("");
      wireTabs();
      body.querySelectorAll("[data-app]").forEach(function (b) {
        b.addEventListener("click", function () { openApplicant(parseInt(b.getAttribute("data-app"), 10)); });
      });
    }).catch(function (e) { body.innerHTML = '<p class="text-muted">' + esc(e.message) + "</p>"; });
  }

  function renderInbox() { loadInbox(null); }

  function actionBtn(id, st, key, cls) {
    return '<button class="btn ' + cls + ' btn-sm" data-act="' + st + '" data-id="' + id + '">' + I18n.t(key) + "</button>";
  }

  function openApplicant(id) {
    if (chatCtl) { chatCtl.destroy(); chatCtl = null; }
    api("/applications/" + id).then(function (d) {
      var a = d.application;
      var mount = el("partnerMount");
      var rows = Object.keys(a.documents || {}).map(function (k) {
        return '<p class="text-sm mb-1"><span class="text-muted">' + esc(k) + ":</span> <strong>" + esc(a.documents[k]) + "</strong></p>";
      }).join("");
      var contact = (a.status === "under_review")
        ? '<p class="text-sm mb-1"><span class="text-muted">Email:</span> <strong>' + esc(d.contact_email || "—") + "</strong></p>" +
          '<p class="text-sm mb-1"><span class="text-muted">' + I18n.t("auth.phone") + ":</span> <strong>" + esc(d.contact_phone || "—") + "</strong></p>"
        : '<p class="text-sm text-muted">' + I18n.t("partner.contactLocked") + "</p>";
      mount.innerHTML = '<button class="btn btn-ghost btn-sm mb-3" id="backBtn">← ' + I18n.t("common.back") + "</button>" +
        '<div class="card mb-4"><h2>' + esc(a.scheme_name) + "</h2>" +
        '<p class="text-muted">' + esc(a.application_no) + "</p><p>" + Chat.statusPill(a.status) + "</p>" +
        '<div class="flex gap-2 flex-wrap mt-3">' +
        (a.status === "submitted"
          ? actionBtn(id, "under_review", "partner.reviewAction", "btn-secondary") + " " : "") +
        (a.status !== "approved" && a.status !== "rejected"
          ? actionBtn(id, "approved", "partner.approve", "btn-primary") + " " +
            actionBtn(id, "rejected", "partner.reject", "btn-ghost")
          : "") + "</div></div>" +
        '<div class="card mb-4"><h3>' + I18n.t("partner.applicant") + "</h3>" +
        '<p class="text-sm mb-1"><strong>' + esc(d.business_name || d.full_name) + "</strong> " +
        '<span class="text-muted">' + esc([d.business_sector, d.business_stage, d.state].filter(Boolean).join(" · ")) + "</span></p>" +
        (d.description ? '<p class="text-sm">' + esc(d.description) + "</p>" : "") + contact + "</div>" +
        '<div class="card mb-4"><h3>' + I18n.t("myapps.details") + "</h3>" + rows + "</div>" +
        (a.status === "under_review"
          ? '<div class="card mb-4"><h3>' + I18n.t("chat.title") + "</h3>" +
            '<div class="chat-box" id="chatBox"></div>' +
            '<div class="flex gap-2"><input type="text" id="chatInput" placeholder="' + I18n.t("chat.placeholder") + '">' +
            '<button class="btn btn-primary btn-sm" id="chatSend">' + I18n.t("chat.send") + "</button></div></div>"
          : "");
      el("backBtn").addEventListener("click", function () {
        if (chatCtl) { chatCtl.destroy(); chatCtl = null; }
        render();
      });
      mount.querySelectorAll("[data-act]").forEach(function (b) {
        b.addEventListener("click", function () {
          API.post("/api/partner/applications/" + b.getAttribute("data-id") + "/status",
            { status: b.getAttribute("data-act") }, Auth.token())
            .then(function (upd) {
              Notify.success(I18n.t("partner.status." + upd.status));
              openApplicant(upd.id);
            })
            .catch(function (e) { Notify.error(e.message); });
        });
      });
      if (a.status === "under_review") {
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
    }).catch(function (e) { Notify.error(e.message); });
  }

  function renderProfile() {
    var body = el("tabBody");
    body.innerHTML = '<div class="text-center py-4"><div class="spinner"></div></div>';
    api("/profile").then(function (p) {
      body.innerHTML = '<div class="card"><h3>' + I18n.t("partner.tab.profile") + "</h3>" +
        ["org_name", "partner_type", "phone", "state", "city", "address"].map(function (f) {
          return '<div class="form-group"><label>' + I18n.t("partner.profile." + f) + "</label>" +
            '<input type="text" id="pp_' + f + '" value="' + esc(p[f] || "") + '"></div>';
        }).join("") +
        '<button class="btn btn-primary btn-block" id="saveProfileBtn">' + I18n.t("common.save") + "</button></div>";
      el("saveProfileBtn").addEventListener("click", function () {
        var payload = {};
        ["org_name", "partner_type", "phone", "state", "city", "address"].forEach(function (f) {
          payload[f] = el("pp_" + f).value.trim();
        });
        API.put("/api/partner/profile", payload, Auth.token())
          .then(function () {
            Notify.success(I18n.t("common.saved"));
            // Re-check completeness: unlocking the rest of the portal.
            api("/profile").then(function (p) {
              if (profileComplete(p)) { profileLocked = false; tab = "schemes"; }
              render();
            }).catch(function () { render(); });
          })
          .catch(function (e) { Notify.error(e.message); });
      });
    }).catch(function (e) { body.innerHTML = '<p class="text-muted">' + esc(e.message) + "</p>"; });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!guard()) return;
    var q = window.readQuery ? window.readQuery() : {};
    if (q.tab === "inbox" || q.tab === "profile" || q.tab === "schemes") tab = q.tab;
    // New and incomplete partners land on the profile first and stay there
    // until org name, phone, state and city are filled.
    api("/profile").then(function (p) {
      profileLocked = !profileComplete(p);
      if (profileLocked) tab = "profile";
      render();
    }).catch(function () { render(); });
  });
})();
