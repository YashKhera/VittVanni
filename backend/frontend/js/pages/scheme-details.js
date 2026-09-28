(function () {
  "use strict";
  if (!document.body || document.body.dataset.page !== "scheme-details") return;

  var scheme = null;
  var isSaved = false;

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function listOf(v) {
    return Array.isArray(v) ? v : [];
  }

  function fundingText(s) {
    if (s.loan_min !== null && s.loan_min !== undefined && s.loan_max !== null && s.loan_max !== undefined) {
      return "₹" + Math.round(s.loan_min / 100000) + "L – ₹" + Math.round(s.loan_max / 100000) + "L";
    }
    if (s.loan_max !== null && s.loan_max !== undefined) return "Up to ₹" + Math.round(s.loan_max / 100000) + "L";
    return "Varies";
  }

  function bulletList(items, fallback) {
    items = listOf(items).filter(function (x) { return x !== null && x !== undefined && x !== ""; });
    if (!items.length) items = [fallback || "—"];
    return '<ul class="detail-list">' + items.map(function (i) {
      if (typeof i === "object") i = i.name || JSON.stringify(i);
      return "<li><span class=\"label\">✓</span><span>" + esc(i) + "</span></li>";
    }).join("") + "</ul>";
  }

  function section(title, innerHtml) {
    return '<div class="detail-card"><h2>' + esc(title) + "</h2>" + innerHtml + "</div>";
  }

  function row(label, value) {
    if (value === null || value === undefined || value === "") return "";
    return "<li><span class=\"label\">" + esc(label) + "</span><span>" + esc(value) + "</span></li>";
  }

  function render() {
    document.getElementById("loadingState").classList.add("hidden");
    var mount = document.getElementById("contentArea");
    mount.classList.remove("hidden");
    document.getElementById("breadcrumbName").textContent = scheme.name;

    var meta = section(I18n.t("details.overview"), bulletList([scheme.description], "Government support for entrepreneurs"));
    var keyInfo = section("Key information",
      '<ul class="detail-list">' +
      row(I18n.t("details.sector"), listOf(scheme.sectors).join(", ")) +
      row(I18n.t("details.level"), cap(scheme.government_level)) +
      row("Department", scheme.department) +
      row(I18n.t("details.state"), listOf(scheme.states).length ? listOf(scheme.states).join(", ") : "All India") +
      row(I18n.t("details.funding"), fundingText(scheme)) +
      row(I18n.t("details.processing"), scheme.processing_days ? scheme.processing_days + " days" : "") +
      "</ul>");

    var tags = listOf(scheme.support_types).map(function (t) { return '<span class="tag">' + esc(cap(t)) + "</span>"; }).join("");
    var supportHtml = tags || '<p class="text-sm mb-0">Financial and / or non-financial support.</p>';

    var benefitHtml = section(I18n.t("details.benefits"), bulletList(scheme.benefits, "—"));
    var eligibilityHtml = section(I18n.t("details.eligibility"), bulletList(scheme.eligibility, "General eligibility applies to this scheme."));
    var docsHtml = section(I18n.t("details.docs"), bulletList(scheme.documents, "Aadhaar / PAN / Business registration / Address proof"));

    var applyHtml = section(I18n.t("details.apply"),
      '<p class="mb-3">' + (scheme.processing_days ? esc(I18n.t("details.processing")) + ": " + esc(scheme.processing_days) + " days" : "") + "</p>" +
      '<div class="flex gap-2 flex-wrap">' +
      '<a class="btn btn-primary" href="/apply?sid=' + encodeURIComponent(scheme.id) + '">' + esc(I18n.t("details.applyNow")) + "</a>" +
      (scheme.official_url || scheme.application_url
        ? '<a class="btn btn-ghost btn-sm" href="' + esc(scheme.official_url || scheme.application_url) + '" target="_blank" rel="noopener">' + esc(I18n.t("details.website")) + "</a>"
        : "") +
      "</div>");

    mount.innerHTML =
      '<div class="card mb-4">' +
      '<div class="flex items-center justify-between flex-wrap gap-3">' +
      "<h1 class=\"mb-1\">" + esc(scheme.name) + "</h1>" +
      '<div class="flex gap-2">' +
      '<button class="btn btn-primary btn-sm" id="saveBtn">' + (isSaved ? "★ " + I18n.t("common.saved") : "☆ " + I18n.t("common.save")) + "</button>" +
      '<a class="btn btn-secondary btn-sm" href="/emi-calculator?scheme=' + encodeURIComponent(scheme.id) + '&autocalc=1" data-i18n="calculator.cta">Calculate EMI for this scheme</a>' +
      '<a class="btn btn-secondary btn-sm" href="/my-schemes" data-i18n="details.back">Back to results</a>' +
      "</div></div>" +
      '<p class="text-muted mb-0 text-sm">' + esc(cap(scheme.government_level || "")) + " · " + esc(listOf(scheme.sectors).join(", ") || "All sectors") + "</p>" +
      "</div>" +
      meta + keyInfo + supportHtml + benefitHtml + eligibilityHtml + docsHtml + applyHtml;

    I18n.apply();
    document.getElementById("saveBtn").addEventListener("click", toggleSave);
  }

  function updateSaveState(id) {
    if (!Auth.isLoggedIn() || !Auth.token()) return Promise.resolve(false);
    return API.get("/api/saved-schemes", Auth.token(), { skipAuthRedirect: true })
      .then(function (data) {
        var items = (data && (data.saved_schemes || data.schemes)) || [];
        isSaved = items.some(function (e) {
          var sid = e.scheme ? e.scheme.id : (e.id || e.scheme_id);
          return String(sid) === String(id);
        });
        var btn = document.getElementById("saveBtn");
        if (btn) btn.textContent = isSaved ? "★ " + I18n.t("common.saved") : "☆ " + I18n.t("common.save");
      })
      .catch(function () {});
  }

  function toggleSave() {
    if (!Auth.isLoggedIn()) { window.location.href = "/login"; return; }
    var id = scheme.id;
    var request = isSaved
      ? API.del("/api/saved-schemes/" + encodeURIComponent(id), Auth.token())
      : API.post("/api/saved-schemes/" + encodeURIComponent(id), {}, Auth.token());
    request.then(function () {
      isSaved = !isSaved;
      var btn = document.getElementById("saveBtn");
      btn.textContent = isSaved ? "★ " + I18n.t("common.saved") : "☆ " + I18n.t("common.save");
      Notify.success(isSaved ? I18n.t("saved.add.toast") : I18n.t("saved.remove.toast"));
    }).catch(function (err) {
      Notify.error(err.message);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!Auth.requireLogin()) return;
    var params = window.readQuery ? window.readQuery() : {};
    var id = params.id;
    if (!id) {
      window.location.href = "/my-schemes";
      return;
    }
    API.get("/api/schemes/" + encodeURIComponent(id), Auth.token())
      .then(function (data) {
        scheme = data;
        render();
        updateSaveState(data.id);
      })
      .catch(function (err) {
        document.getElementById("loadingState").classList.add("hidden");
        document.getElementById("contentArea").classList.remove("hidden");
        document.getElementById("contentArea").innerHTML =
          '<div class="detail-card text-center">' +
          "<h2 data-i18n=\"details.notFound\">Scheme not found</h2>" +
          '<p class="text-muted">' + esc(err.message) + "</p>" +
          '<a class="btn btn-primary mt-3" href="/my-schemes" data-i18n="details.back">Back to results</a>' +
          "</div>";
        I18n.apply();
      });
  });
})();