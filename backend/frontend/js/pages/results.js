(function () {
  "use strict";

  if (!document.body || document.body.dataset.page !== "results") return;

  var match = null;
  var profileInfo = {};
  var savedIdsFromServer = [];
  var matching = { savedIds: AppStore.getSavedIds() || [] };
  var filterTimer;

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function loadSaved() {
    if (!Auth.isLoggedIn() || !Auth.token()) return Promise.resolve([]);
    return API.get("/api/saved-schemes", Auth.token(), { skipAuthRedirect: true })
      .then(function (data) {
        savedIdsFromServer = (data.saved_schemes || data.schemes || []).map(function (s) {
          return s.scheme ? s.scheme.id : (s.id || s.scheme_id);
        });
        return savedIdsFromServer;
      })
      .catch(function () { savedIdsFromServer = []; return []; });
  }

  function currentSavedSet() {
    var set = {};
    savedIdsFromServer.forEach(function (id) { set[id] = true; });
    (matching.savedIds || []).forEach(function (id) {
      set[id] = true;
    });
    return set;
  }

  function schemeId(item) {
    var s = item.scheme ? item.scheme : item;
    return s.id || s.scheme_id || s["scheme_id"];
  }

  function displayName() {
    var pt = (profileInfo.project_type ||
      (match && match.profile_summary && match.profile_summary.project_type) ||
      "business").toLowerCase();
    if (pt === "education") {
      return profileInfo.full_name || (Auth.user() && Auth.user().email) || "";
    }
    return profileInfo.business_name || profileInfo.full_name ||
      (Auth.user() && Auth.user().email) || "";
  }

  function render(mount) {
    var savedSet = currentSavedSet();

    if (!match || !match.recommendations || !match.recommendations.length) {
      mount.innerHTML =
        '<div class="text-center" style="padding:var(--space-7) 0">' +
        '<h2>' + I18n.t("results.empty.title") + "</h2>" +
        '<p>' + I18n.t("results.empty.text") + "</p>" +
        '<div class="flex justify-center gap-2 mt-4">' +
        '<a class="btn btn-primary" href="/find-schemes">' + I18n.t("questionnaire.start.btn") + "</a>" +
        '<a class="btn btn-secondary" href="/profile/edit">' + I18n.t("profile.update") + "</a>" +
        "</div></div>";
      return;
    }

    var summary = document.getElementById("resultsSummary");
    if (summary) {
      summary.classList.remove("hidden");
      var ps = match.profile_summary || {};
      var pills = "";
      if (ps.project_type) {
        pills += '<span class="tag-chip">' + I18n.t("profile.projectType") + ": " + esc(I18n.t("projectType." + ps.project_type) || ps.project_type) + "</span>";
      }
      if (ps.ideal_loan_category) {
        pills += '<span class="tag-chip tag-chip-sector">' + I18n.t("profile.bestLoanFit") + ": " + esc(I18n.t("loanCategory." + ps.ideal_loan_category) || ps.ideal_loan_category) + "</span>";
      }
      summary.innerHTML =
        '<div class="text-center mb-5">' +
        '<h2>' + I18n.t("results.title") + "</h2>" +
        '<p class="text-muted">' + I18n.t("results.sub", { name: displayName() }) + "</p>" +
        (pills ? '<p class="mt-3">' + pills + "</p>" : "") +
        "</div>";
    }

    var mount2 = document.getElementById("resultsMount");
    if (!mount2) return;

    var savedCount = Object.keys(savedSet).length;
    var grid = document.createElement("div");
    grid.className = "grid-auto gap-4";
    match.recommendations.forEach(function (item) {
      var sid = schemeId(item);
      grid.innerHTML += SchemeCard.render(item, {
        allowSave: true,
        saved: !!savedSet[sid],
        onSavedChange: function (active) {
          if (active) {
            if (savedIdsFromServer.indexOf(sid) === -1) savedIdsFromServer.push(sid);
          } else {
            savedIdsFromServer = savedIdsFromServer.filter(function (x) { return x !== sid; });
          }
        },
        mount: grid
      });
    });

    mount2.innerHTML =
      '<div class="flex items-center justify-between mb-5">' +
      "<div>" +
      '<h2>' + I18n.t("results.title") + "</h2>" +
      '<p class="text-muted mb-0">' + I18n.t("results.sub", { name: displayName() }) + "</p>" +
      "</div>" +
      '<div class="flex items-center gap-2">' +
      '<input id="filterInput" type="search" class="no-print" style="min-width:200px" placeholder="' + I18n.t("results.search") + '"/>' +
      '<select id="sortSelect" class="no-print" style="width:auto">' +
      '<option value="score">' + I18n.t("results.sort.score") + "</option>" +
      '<option value="funding">' + I18n.t("results.sort.funding") + "</option>" +
      "</select></div></div>" +
      '<div id="resultsGrid" class="grid-auto gap-4"></div>';

    var gridEl = document.getElementById("resultsGrid");
    match.recommendations.forEach(function (item) {
      var sid = schemeId(item);
      gridEl.innerHTML += SchemeCard.render(item, {
        allowSave: true,
        saved: !!savedIdsFromServer.concat(matching.savedIds || []).filter(function (x) { return x === sid; }).length,
        onSavedChange: function (active) {
          if (active) {
            if (savedIdsFromServer.indexOf(sid) === -1) savedIdsFromServer.push(sid);
          } else {
            savedIdsFromServer = savedIdsFromServer.filter(function (x) { return x !== sid; });
          }
        },
        mount: gridEl
      });
    });
    SchemeCard.wire();

    var filter = document.getElementById("filterInput");
    var sort = document.getElementById("sortSelect");
    if (filter) filter.addEventListener("input", onFilter);
    if (sort) sort.addEventListener("change", onSort);
  }

  function filtered() {
    var q = document.getElementById("filterInput");
    var qv = (q && q.value || "").toLowerCase();
    var sort = document.getElementById("sortSelect");
    var sv = sort ? sort.value : "score";

    var rows = match.recommendations.filter(function (item) {
      var s = item.scheme ? item.scheme : item;
      if (!qv) return true;
      return ((s.name || "") + " " + (s.sector || s.business_sector || "") + " " + (s.summary || "")).toLowerCase().indexOf(qv) !== -1;
    });

    if (sv === "funding") {
      rows = rows.slice().sort(function (a, b) {
        return SchemeCard.fundingMax(b) - SchemeCard.fundingMax(a);
      });
    }
    return rows;
  }

  function onFilter() {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(resort, 200);
  }

  function onSort() {
    resort();
  }

  function resort() {
    var grid = document.getElementById("resultsGrid");
    if (!grid) return;
    grid.innerHTML = "";
    filtered().forEach(function (item) {
      var sid = schemeId(item);
      grid.innerHTML += SchemeCard.render(item, {
        allowSave: true,
        saved: !!currentSavedSet()[sid],
        onSavedChange: function (active) {
          if (active) {
            if (savedIdsFromServer.indexOf(sid) === -1) savedIdsFromServer.push(sid);
          } else {
            savedIdsFromServer = savedIdsFromServer.filter(function (x) { return x !== sid; });
          }
        }
      });
    });
    SchemeCard.wire();
  }

  function afterProfile(mount) {
    loadSaved().then(function () {
      var last = AppStore.getLast();
      API.post("/api/recommendations", {}, Auth.token())
        .then(function (data) {
          match = data;
          AppStore.setLast(data);
          AppStore.enqueueRecommendations(data.recommendations || []);
          render(mount);
        })
        .catch(function (err) {
          if (err.status === 400 || err.status === 404) {
            match = null;
            render(mount);
            return;
          }
          match = last;
          AppStore.enqueueRecommendations(match && match.recommendations || []);
          render(mount);
          Notify.warning(err.message);
        });
    });
  }

  function load() {
    var mount = document.getElementById("resultsMount");
    if (!mount) return;
    Skeleton.show(mount, 3);

    API.get("/api/profile", Auth.token(), { skipAuthRedirect: true })
      .then(function (p) { profileInfo = p || {}; afterProfile(mount); })
      .catch(function (err) {
        if (err && err.status === 404) {
          window.location.href = "/profile/edit";
          return;
        }
        afterProfile(mount);
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!Auth.requireLogin()) return;
    load();
  });

  window.addEventListener("languagechange", function () {
    if (!Auth || !Auth.isLoggedIn()) return;
    if (match === null) return;
    var mount = document.getElementById("resultsMount");
    if (mount) render(mount);
  });
})();