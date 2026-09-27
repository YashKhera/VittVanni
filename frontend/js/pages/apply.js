(function () {
  "use strict";
  if (!document.body || document.body.dataset.page !== "apply") return;

  var schemeId = null;
  var scheme = null;
  var docFields = [];
  var partners = [];
  var chosenPartner = null;
  var profileCache = null;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function stepPartner() {
    var mount = el("applyMount");
    var opts = partners.map(function (p) {
      var label = p.org_name + " — " + [p.city, p.state].filter(Boolean).join(", ");
      return '<label class="partner-pick"><input type="radio" name="partner" value="' + p.partner_id + '">' +
        '<span><strong>' + esc(p.org_name) + "</strong><br>" +
        '<span class="text-sm text-muted">' + esc([p.partner_type, p.city, p.state].filter(Boolean).join(" · ")) + "</span>" +
        (p.phone ? '<br><span class="text-sm">' + esc(p.phone) + "</span>" : "") + "</span></label>";
    }).join("");
    mount.innerHTML =
      '<div class="card fade-in-up"><h2 class="mb-1">' + I18n.t("apply.partner.title") + "</h2>" +
      '<p class="text-muted">' + esc(scheme ? scheme.name : "") + "</p>" +
      '<div id="formError" class="form-error hidden"></div>' +
      (opts || '<p class="text-muted">' + I18n.t("apply.partner.none") + "</p>") +
      '<button class="btn btn-primary btn-block mt-4" id="toFormBtn">' + I18n.t("common.next") + "</button></div>";
    el("toFormBtn").addEventListener("click", function () {
      var sel = mount.querySelector('input[name="partner"]:checked');
      if (!sel) {
        var e = el("formError");
        e.textContent = I18n.t("apply.partner.required");
        e.classList.remove("hidden");
        return;
      }
      chosenPartner = sel.value;
      stepForm();
    });
  }

  function fieldHtml(f) {
    return '<div class="form-group"><label for="doc_' + f.key + '">' + esc(f.label) +
      (f.sensitive ? ' <span class="tag-chip">🔒 ' + I18n.t("apply.doc.private") + "</span>" : "") + "</label>" +
      '<input type="text" id="doc_' + f.key + '" data-doc-key="' + f.key + '" autocomplete="off"></div>';
  }

  function stepForm() {
    var mount = el("applyMount");
    var p = profileCache || {};
    mount.innerHTML =
      '<div class="card fade-in-up"><h2 class="mb-1">' + I18n.t("apply.form.title") + "</h2>" +
      '<p class="text-muted">' + esc(scheme ? scheme.name : "") + "</p>" +
      '<div id="formError" class="form-error hidden"></div>' +
      '<h3 class="mt-4 mb-2">' + I18n.t("apply.form.basic") + "</h3>" +
      '<div class="form-group"><label for="f_name">' + I18n.t("auth.username") + "</label>" +
      '<input type="text" id="f_name" value="' + esc(p.full_name || "") + '"></div>' +
      '<div class="form-group"><label for="f_phone">' + I18n.t("auth.phone") + "</label>" +
      '<input type="text" id="f_phone" value="' + esc(p.phone_number || "") + '"></div>' +
      '<h3 class="mt-4 mb-2">' + I18n.t("apply.form.business") + "</h3>" +
      '<div class="form-group"><label for="f_bname">' + I18n.t("apply.form.bname") + "</label>" +
      '<input type="text" id="f_bname" value="' + esc(p.business_name || "") + '"></div>' +
      '<div class="form-group"><label for="f_sector">' + I18n.t("apply.form.sector") + "</label>" +
      '<input type="text" id="f_sector" value="' + esc(p.business_sector || "") + '"></div>' +
      '<h3 class="mt-4 mb-2">' + I18n.t("apply.form.docs") + "</h3>" +
      '<p class="text-sm text-muted">' + I18n.t("apply.doc.note") + "</p>" +
      docFields.map(fieldHtml).join("") +
      '<button class="btn btn-primary btn-block mt-4" id="submitAppBtn">' + I18n.t("apply.form.submit") + "</button></div>";
    el("submitAppBtn").addEventListener("click", submitApp);
  }

  function submitApp() {
    var err = el("formError");
    err.classList.add("hidden");
    var docs = {};
    for (var i = 0; i < docFields.length; i++) {
      var k = docFields[i].key;
      var v = (el("doc_" + k).value || "").trim();
      if (!v) {
        err.textContent = I18n.t("apply.doc.required", { field: docFields[i].label });
        err.classList.remove("hidden");
        return;
      }
      docs[k] = v;
    }
    var form = {
      name: el("f_name").value.trim(),
      phone: el("f_phone").value.trim(),
      business_name: el("f_bname").value.trim(),
      sector: el("f_sector").value.trim()
    };
    var btn = el("submitAppBtn");
    btn.disabled = true;
    btn.textContent = I18n.t("common.loading");
    API.post("/api/applications", {
      scheme_id: schemeId, partner_id: parseInt(chosenPartner, 10),
      form_data: form, documents: docs
    }, Auth.token())
      .then(function (data) { stepDone(data); })
      .catch(function (e) {
        err.textContent = e.message;
        err.classList.remove("hidden");
        btn.disabled = false;
        btn.textContent = I18n.t("apply.form.submit");
      });
  }

  function stepDone(data) {
    var mount = el("applyMount");
    mount.innerHTML =
      '<div class="card fade-in-up text-center" style="padding:48px 24px">' +
      '<div class="success-check">✓</div>' +
      '<h2>' + I18n.t("apply.done.title") + "</h2>" +
      '<p class="text-muted">' + I18n.t("apply.done.sub") + "</p>" +
      '<p class="mt-3"><span class="tag-chip tag-chip-sector" style="font-size:1.05rem">' + esc(data.application_no) + "</span></p>" +
      '<div class="flex gap-2 justify-center mt-4">' +
      '<a class="btn btn-primary" href="/my-applications">' + I18n.t("apply.done.track") + "</a>" +
      '<a class="btn btn-secondary" href="/my-schemes">' + I18n.t("details.back") + "</a>" +
      "</div></div>";
  }

  function boot() {
    if (!Auth.requireLogin()) return;
    var q = window.readQuery ? window.readQuery() : {};
    schemeId = parseInt(q.sid || "0", 10);
    if (!schemeId) { window.location.href = "/my-schemes"; return; }
    var mount = el("applyMount");
    mount.innerHTML = '<div class="text-center py-4"><div class="spinner"></div></div>';
    API.get("/api/schemes/" + schemeId, Auth.token(), { skipAuthRedirect: true })
      .then(function (s) {
        scheme = s;
        return API.get("/api/applications/doc-schema/" + schemeId, Auth.token());
      })
      .then(function (d) {
        docFields = d.fields || [];
        return API.get("/api/profile", Auth.token(), { skipAuthRedirect: true }).catch(function () { return {}; });
      })
      .then(function (p) {
        profileCache = p || {};
        var state = (profileCache.state || "").toLowerCase();
        return API.get("/api/applications/partners?scheme_id=" + schemeId + (state ? "&state=" + encodeURIComponent(state) : ""), Auth.token());
      })
      .then(function (list) {
        partners = list || [];
        stepPartner();
      })
      .catch(function (e) {
        mount.innerHTML = '<p class="text-muted">' + esc(e.message) + '</p><a class="btn btn-secondary mt-3" href="/my-schemes">' + I18n.t("details.back") + "</a>";
      });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
