(function () {
  "use strict";

  window.SchemeCard = {
    render: function (item, opts) {
      opts = opts || {};
      var m = item.match_score !== undefined ? item.match_score : (item.score || 0);
      var id = item.scheme ? item.scheme.id : item.id;
      var title = item.scheme ? item.scheme.name : item.name;
      var body = item.scheme ? item.scheme : item;
      var min = body.funding_min !== undefined ? body.funding_min : (body.funding_range ? body.funding_range[0] : null);
      var max = body.funding_max !== undefined ? body.funding_max : (body.funding_range ? body.funding_range[1] : null);

      var funding = body.funding_amount || body.funding_text || "";
      if (funding === "" && min !== null) {
        funding = "₹" + Math.round(min / 100000) + "L – ₹" + Math.round(max / 100000) + "L";
      }

      var html =
        '<article class="card scheme-card fade-in-up">' +
        '<div class="scheme-header">' +
        '<div><h3 class="mb-1">' + this._esc(title) + "</h3>" +
        '<div class="scheme-meta">' +
        '<span class="badge badge-info">' + this._esc(body.sector || "all") + "</span>" +
        (body.loan_category ? '<span class="badge badge-success">' + this._esc(I18n.t("loanCategory." + body.loan_category) || body.loan_category) + "</span>" : "") +
        '<span>' + this._esc(body.location_type || "") + "</span>" +
        (body.state ? "<span>" + this._esc(body.state) + "</span>" : "") +
        "</div></div>" +
        '<div class="scheme-match">' +
        '<div class="match-text">' + MatchBadge.render(m) +
        '<div class="match-score-value">' + Math.round(m) + '%</div>' +
        '<div class="text-sm text-muted">' + I18n.t("results.score.label") + "</div></div>" +
        "</div></div>";

      if (item.matched_criteria && item.matched_criteria.length) {
        html += '<div class="mt-3">' +
          '<h4 class="text-sm mb-2">' + I18n.t("results.breakdown.title") + "</h4>" +
          '<div>' + item.matched_criteria.map(function (c) { return '<span class="tag-chip">' + this._esc(c) + "</span>"; }.bind(this)).join("") + "</div>" +
          (item.match_breakdown && item.match_breakdown.tier_match > 0
            ? '<p class="text-sm mt-2 mb-0"><strong>' + I18n.t("results.tier.match") + " ✓</strong></p>"
            : "") +
          "</div>";
      }

      if (item.explanation) {
        html += '<div class="mt-3 p-3" style="background:var(--bg-tertiary);border-radius:var(--radius-md)">' +
          "<strong class=\"text-sm\" data-i18n=\"results.explanation\">" + I18n.t("results.explanation") + "</strong>" +
          '<p class="text-sm mb-0 mt-1">' + this._esc(item.explanation) + "</p></div>";
      }

      if (item.possible_gap) {
        html += '<div class="text-sm mt-3 mb-0"><strong>' + I18n.t("results.need") + ": </strong>" + this._esc(item.possible_gap) + "</div>";
      }

      html +=
        '<div class="scheme-actions mt-4">' +
        '<a class="btn btn-secondary btn-sm" href="/scheme?id=' + encodeURIComponent(id) + '">' + I18n.t("common.viewDetails") + "</a>" +
        '<a class="btn btn-primary btn-sm" href="/apply?sid=' + encodeURIComponent(id) + '">' + I18n.t("details.applyNow") + "</a>" +
        '<a class="btn btn-ghost btn-sm" href="/emi-calculator?scheme=' + encodeURIComponent(id) + '&autocalc=1" data-i18n="calculator.cta">' + I18n.t("calculator.cta") + "</a>" +
        (opts.allowSave === false ? "" :
          '<button class="btn btn-sm ' + (opts.saved ? "btn-primary" : "btn-ghost") + '" data-save-scheme="' + encodeURIComponent(id) + '" aria-label="Save scheme">' + (opts.saved ? "★ " + I18n.t("common.saved") : "☆ " + I18n.t("common.save")) + "</button>") +
        (opts.allowRemove === true ?
          '<button class="btn btn-sm btn-error" data-remove-scheme="' + encodeURIComponent(id) + '">' + I18n.t("common.remove") + "</button>" : "") +
        "</div></article>";

      return html;
    },

    wireSave: function (mount, onSavedChange) {
      mount.querySelectorAll("[data-save-scheme]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = decodeURIComponent(btn.getAttribute("data-save-scheme"));
          if (btn.classList.contains("btn-primary")) {
            API.del("/api/saved-schemes/" + encodeURIComponent(id), Auth.token())
              .then(function () {
                btn.classList.remove("btn-primary"); btn.classList.add("btn-ghost");
                btn.textContent = "☆ " + I18n.t("common.save");
                Notify.success(I18n.t("saved.remove.toast"));
                if (onSavedChange) onSavedChange(false, id);
              })
              .catch(function (e) { Notify.error(e.message); });
          } else {
            API.post("/api/saved-schemes/" + encodeURIComponent(id), {}, Auth.token())
              .then(function () {
                btn.classList.remove("btn-ghost"); btn.classList.add("btn-primary");
                btn.textContent = "★ " + I18n.t("common.saved");
                Notify.success(I18n.t("saved.add.toast"));
                if (onSavedChange) onSavedChange(true, id);
              })
              .catch(function (e) { Notify.error(e.message); });
          }
        });
      });
      mount.querySelectorAll("[data-remove-scheme]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = decodeURIComponent(btn.getAttribute("data-remove-scheme"));
          API.del("/api/saved-schemes/" + encodeURIComponent(id), Auth.token())
            .then(function () {
              btn.closest(".scheme-card").remove();
              Notify.success(I18n.t("saved.remove.toast"));
              if (onSavedChange) onSavedChange(false, id, true);
            })
            .catch(function (e) { Notify.error(e.message); });
        });
      });
    },

    wire: function (mount) {
      mount = mount || document;
      this.wireSave(mount, null);
    },

    fundingMax: function (item) {
      var s = (item && item.scheme) ? item.scheme : (item || {});
      if (typeof s.funding_max === "number") return s.funding_max;
      if (typeof s.loan_max === "number") return s.loan_max;
      if (Array.isArray(s.funding_range) && s.funding_range.length > 1) return Number(s.funding_range[1]) || 0;
      var m = String(s.funding_range || "").match(/\d+(?:\.\d+)?/g);
      if (m && m.length) return Math.max.apply(null, m.map(Number));
      return 0;
    },

    _esc: function (s) {
      return String(s === undefined || s === null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
  };
})();