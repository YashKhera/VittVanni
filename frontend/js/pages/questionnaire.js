(function () {
  "use strict";
  if (!document.body || document.body.dataset.page !== "questionnaire") return;

  var profile = null;
  var steps = [];
  var STEP_TOTAL = 0;
  var step = 0;
  var answers = {};
  var mode = null;
  var describeText = "";
  var describeUnderstand = null;
  var lastScene = "";

  window.addEventListener("languagechange", function () {
    if (mode === "form") {
      if (steps.length) render();
      return;
    }
    if (lastScene === "summary" && describeUnderstand) {
      renderDescribeSummary(describeUnderstand);
      return;
    }
    if (lastScene === "describe") {
      renderDescribe();
      return;
    }
    renderGate();
  });

  // Static questions (Questions.list) whose values are already captured on the
  // profile page — we prefill them, never re-ask them, and only show chips.
  var PROFILE_LOOKUP = [
    { id: "full_name", field: "full_name", kind: "text", labelKey: "questionnaire.auto.name" },
    { id: "phone_number", field: "phone_number", kind: "text", labelKey: "questionnaire.auto.phone" },
    { id: "age_group", field: "age_group", kind: "opts", options: "ageGroups", labelKey: "questionnaire.auto.age" },
    { id: "gender", field: "gender", kind: "opts", options: "genders", labelKey: "questionnaire.auto.gender" },
    { id: "business_sector", field: "business_sector", kind: "opts", options: "sectors", labelKey: "questionnaire.auto.sector" },
    { id: "state", field: "state", kind: "opts", options: "states", labelKey: "questionnaire.auto.state" },
    { id: "business_stage", field: "business_stage", kind: "opts", options: "stages", labelKey: "questionnaire.auto.stage" },
    { id: "annual_revenue", field: "annual_revenue", kind: "opts", options: "revenueGroups", labelKey: "questionnaire.auto.revenue" },
    { id: "annual_family_income", field: "annual_family_income", kind: "opts", options: "familyIncomeGroups", labelKey: "questionnaire.auto.income" },
    { id: "education_status", field: "education_status", kind: "opts", options: "educationStatuses", labelKey: "questionnaire.auto.education" },
    { id: "estimated_project_cost", field: "estimated_project_cost", kind: "text", labelKey: "questionnaire.auto.projectCost" },
    { id: "entrepreneur_type", field: "social_category", kind: "category", labelKey: "questionnaire.auto.category" }
  ];

  var POST_PROFILE_IDS = { financial: true, non_financial: true, description: true };
  var FINAL_IDS = ["understand", "review"];
  var SC_IDS = ["annual_family_income", "education_status", "estimated_project_cost"];

  function isScCategory() {
    if (profile && profile.social_category === "sc") return true;
    var et = answers.entrepreneur_type;
    if (et) {
      if (Array.isArray(et)) return et.indexOf("sc") !== -1;
      return String(et).indexOf("sc") !== -1;
    }
    return false;
  }

  function profileHasScFields() {
    if (!profile) return false;
    return !!(profile.annual_family_income && profile.education_status && profile.estimated_project_cost);
  }

  function optText(o) {
    return I18n.loc(o);
  }

  function optionsFor(q) {
    var key = q.options;
    if (!key) return [];
    if (Array.isArray(key)) return key;
    if (typeof key === "function") return key();
    if (key === "financial" || key === "nonFinancial") return Questions.supportNeeds[key] || [];
    return Questions[key] || [];
  }

  function selectedValues(inputs) {
    return Array.prototype.slice.call(inputs).filter(function (i) { return i.checked; }).map(function (i) { return i.value; });
  }

  function textValue() {
    var el = document.getElementById("q-input");
    return el ? el.value.trim() : "";
  }

  function answeredCount() {
    return steps.filter(function (q) {
      if (q.type === "review") return false;
      var v = answers[q.id];
      if (q.type === "understand") return !!(v && v.understand_confirmed === true);
      if (q.type === "textarea" || q.type === "text") return !!(v && String(v).trim());
      if (q.type === "multi") return v && v.length > 0;
      return !!v;
    }).length;
  }

  function answeredPercent() {
    var total = STEP_TOTAL - 1;
    return total > 0 ? Math.round((answeredCount() / total) * 100) : 0;
  }

  function profileFilledCount() {
    var n = 0;
    PROFILE_LOOKUP.forEach(function (l) {
      if (prefilledValue(l)) n++;
    });
    return n;
  }

  function prefilledValue(l) {
    if (!profile) return null;
    if (l.kind === "category") return profile.social_category || null;
    var v = profile[l.field];
    return (v === undefined || v === null || v === "") ? null : v;
  }

  function prefillFromProfile() {
    PROFILE_LOOKUP.forEach(function (l) {
      var raw = prefilledValue(l);
      if (!raw) return;
      if (answers && Object.prototype.hasOwnProperty.call(answers, l.id)) return;
      if (l.kind === "category") {
        var map = { sc: "sc", st: "st", obc: "obc" };
        answers[l.id] = map[raw] ? map[raw] : (raw === "general" ? "general" : undefined);
      } else {
        answers[l.id] = raw;
      }
    });
  }

  function sectorLabel(sector) {
    if (!sector) return "";
    var list = Questions.sectors.filter(function (s) { return s.value === sector; });
    return list.length ? optText(list[0]) : sector;
  }

  function pickText(list, value) {
    var o = list.filter(function (x) { return x.value === value; })[0];
    return o ? optText(o) : (value || "");
  }

  function stateOptions() {
    return (Questions.states || []).filter(function (s) { return s.value !== "all"; });
  }

  function renderGate() {
    mode = null;
    var mount = document.getElementById("questionMount");
    mount.innerHTML =
      '<div class="question-card fade-in">' +
      '<h1 class="question-text" style="font-size:1.4rem">' + I18n.t("questionnaire.gate.title") + "</h1>" +
      '<p class="text-muted mb-4">' + I18n.t("questionnaire.gate.sub") + "</p>" +
      '<div class="gate-options">' +
      '<button class="gate-card gate-card-primary" id="gateDescribeBtn">' +
      '<span class="gate-card-title">' + I18n.t("questionnaire.gate.describeTitle") + "</span>" +
      '<span class="gate-card-sub">' + I18n.t("questionnaire.gate.describeSub") + "</span>" +
      '</button>' +
      '<button class="gate-card" id="gateFormBtn">' +
      '<span class="gate-card-title">' + I18n.t("questionnaire.gate.formTitle") + "</span>" +
      '<span class="gate-card-sub">' + I18n.t("questionnaire.gate.formSub") + "</span>" +
      "</button>" +
      "</div>" +
      (profile ? "" : '<p class="text-sm text-muted mt-4">' + I18n.t("questionnaire.gate.noProfileNote") + "</p>") +
      "</div>";

    document.getElementById("gateDescribeBtn").addEventListener("click", function () {
      mode = "describe";
      renderDescribe();
    });
    document.getElementById("gateFormBtn").addEventListener("click", function () {
      mode = "form";
      loadForm();
    });

    renderHeader();
  }

  function renderDescribe() {
    var mount = document.getElementById("questionMount");
    var sr = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    var mic = sr ? '<button class="btn btn-secondary" id="micBtn" type="button">' + I18n.t("questionnaire.describe.mic") + "</button>" : "";
    var placeholder = I18n.current() === "hi"
      ? "जैसे: मैं घर से पापड़ और मसाले बनाती हूँ और उन्हें बेचना चाहती हूँ। मुझे ऋण की ज़रूरत है।"
      : I18n.current() === "en"
        ? "e.g. I make papad and spices at home and want to sell them. I need a loan to buy a machine."
        : I18n.t("questionnaire.describe.placeholder") || "e.g. I make papad and spices at home and want to sell them. I need a loan to buy a machine.";
    mount.innerHTML =
      '<div class="question-card fade-in">' +
      '<h2 class="question-text">' + I18n.t("questionnaire.describe.title") + "</h2>" +
      '<p class="mb-4">' + I18n.t("questionnaire.describe.help") + "</p>" +
      '<textarea id="describeText" rows="5" placeholder="' + placeholder + '">' + escapeHtml(describeText) + "</textarea>" +
      '<p class="mic-row' + (mic ? "" : " hidden") + '"><span class="text-sm text-muted">' + I18n.t("questionnaire.describe.micHint") + "</span> " + mic + "</p>" +
      '<div class="question-actions">' +
      '<button class="btn btn-secondary" id="gateBackBtn">' + I18n.t("common.back") + "</button>" +
      '<button class="btn btn-primary" id="describeBtn">' + I18n.t("questionnaire.describe.analyze") + "</button>" +
      "</div>" +
      "</div>";

    document.getElementById("gateBackBtn").addEventListener("click", renderGate);
    document.getElementById("describeBtn").addEventListener("click", analyzeDescription);
    var taEl = document.getElementById("describeText");
    if (taEl) {
      taEl.addEventListener("input", function () {
        describeText = taEl.value;
        saveDraft("describe");
      });
    }
    if (sr) bindMic(document.getElementById("micBtn"));
    saveDraft("describe");
    lastScene = "describe";
  }

  function bindMic(btn) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = new SR();
    rec.lang = I18n.current() === "en" ? "en-IN" : I18n.current();
    rec.continuous = false;
    rec.interimResults = true;
    btn.addEventListener("click", function () {
      document.getElementById("describeText").focus();
      rec.start();
    });
    rec.onstart = function () {
      btn.textContent = I18n.t("questionnaire.describe.micListening");
      btn.classList.add("btn-primary");
    };
    rec.onresult = function (e) {
      var text = "";
      for (var i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      var ta = document.getElementById("describeText");
      if (ta) { ta.value = text; ta.dispatchEvent(new Event("input")); }
    };
    rec.onend = function () {
      btn.textContent = I18n.t("questionnaire.describe.mic");
      btn.classList.remove("btn-primary");
    };
    rec.onerror = function () {
      btn.textContent = I18n.t("questionnaire.describe.mic");
      btn.classList.remove("btn-primary");
    };
  }

  function analyzeDescription() {
    var ta = document.getElementById("describeText");
    var text = ta ? ta.value.trim() : "";
    if (!text) {
      Notify.warning(I18n.t("common.required"));
      return;
    }
    describeText = text;
    saveDraft("describe");
    analyzeText(describeText);
  }

  function analyzeText(text) {
    var mount = document.getElementById("questionMount");
    mount.innerHTML = '<div class="question-card text-center py-4">' +
      '<div class="spinner"></div><p class="mt-3 text-muted">' + I18n.t("questionnaire.describe.thinking") + "</p></div>";
    API.post("/api/ai/understand", { description: text }, Auth.token())
      .then(function (u) {
        describeUnderstand = u;
        renderDescribeSummary(u);
      })
      .catch(function () {
        mount.innerHTML = '<div class="question-card text-center py-4"><p class="text-muted">' + I18n.t("questionnaire.describe.failed") + "</p>" +
          '<button class="btn btn-secondary mt-3" id="describeRetryBtn">' + I18n.t("questionnaire.understand.reunderstand") + "</button></div>";
        document.getElementById("describeRetryBtn").addEventListener("click", renderDescribe);
      });
  }

  function needCategoryPick() {
    return !(profile && profile.social_category && ["sc", "st", "obc", "pwd", "general"].indexOf(profile.social_category) !== -1);
  }

  function needStatePick() {
    return !(profile && profile.state && profile.state !== "all");
  }

  function renderDescribeSummary(u) {
    var mount = document.getElementById("questionMount");
    var needs = u.support_needs || [];
    var stageKey = u.stage === "new" ? "new" : (u.stage === "existing" ? "existing" : null);
    var sector = sectorLabel(u.sector);

    var chips = "";
    if (sector) chips += '<span class="tag-chip tag-chip-sector">' + escapeHtml(sector) + "</span>";
    if (u.project_type) chips += '<span class="tag-chip tag-chip-project-type">' + escapeHtml(I18n.t("projectType." + u.project_type) || u.project_type) + "</span>";
    if (stageKey) chips += '<span class="tag-chip tag-chip-stage">' + (stageKey === "new"
      ? I18n.loc({ hi: "अभी शुरू हो रहा है", en: "New venture", pa: "ਨਵਾਂ ਉੱਦਮ" })
      : I18n.loc({ hi: "पहले से चल रहा है", en: "Already running", pa: "ਪਹਿਲਾਂ ਤੋਂ ਚੱਲ ਰਿਹਾ" })) + "</span>";
    needs.forEach(function (n) {
      chips += '<span class="tag-chip">' + escapeHtml(I18n.t("questionnaire.describe.need." + n)) + "</span>";
    });

    var quick = "";
    if (needCategoryPick() || needStatePick()) {
      quick += '<div class="describe-picks">';
      if (needCategoryPick()) {
        quick += '<div class="mb-3"><p class="text-sm text-muted mb-2">' + I18n.t("questionnaire.describe.pickCategory") + "</p>" +
          '<div class="chip-group" id="categoryChips">' +
          Questions.entrepreneurTypes.map(function (c) {
            return '<label class="chip-opt"><input type="radio" name="dsc" value="' + c.value + '"> ' + optText(c) + "</label>";
          }).join("") +
          "</div></div>";
      }
      if (needStatePick()) {
        var cur = (profile && profile.state) ? profile.state : "all";
        quick += '<div class="mb-3"><p class="text-sm text-muted mb-2">' + I18n.t("questionnaire.describe.pickState") + "</p>" +
          '<select id="describeState" class="form-select">' +
          stateOptions().map(function (s) {
            return '<option value="' + s.value + '"' + (s.value === cur ? " selected" : "") + ">" + optText(s) + "</option>";
          }).join("") +
          "</select></div>";
      }
      quick += "</div>";
    }
    quick += scQuickHtml();

    var summary = I18n.summary(u);
    mount.innerHTML =
      '<div class="question-card fade-in">' +
      '<h2 class="question-text">' + I18n.t("questionnaire.describe.summaryTitle") + "</h2>" +
      '<div class="understanding-tip">' +
      (summary ? '<p class="understanding-summary">' + escapeHtml(summary) + "</p>" : "") +
      (chips ? '<p>' + chips + "</p>" : "") +
      "</div>" +
      quick +
      '<div class="question-actions">' +
      '<button class="btn btn-secondary" id="describeEditBtn">' + I18n.t("questionnaire.describe.edit") + "</button>" +
      '<button class="btn btn-primary btn-lg" id="describeApplyBtn">' + I18n.t("questionnaire.describe.apply") + "</button>" +
      "</div>" +
      "</div>";

    document.getElementById("describeEditBtn").addEventListener("click", renderDescribe);
    document.getElementById("describeApplyBtn").addEventListener("click", function () { applyDescription(u); });
    var scCatChips = document.querySelectorAll('#categoryChips input[name="dsc"]');
    Array.prototype.forEach.call(scCatChips, function (i) {
      i.addEventListener("change", toggleScQuick);
    });
    toggleScQuick();
    saveDraft("summary");
    lastScene = "summary";
  }

  function scQuickHtml() {
    if (!needCategoryPick() && (!profile || profile.social_category !== "sc")) return "";
    var always = !!(profile && profile.social_category === "sc");
    var curIncome = profile && profile.annual_family_income ? profile.annual_family_income : "";
    var curEdu = profile && profile.education_status ? profile.education_status : "";
    var curCost = profile && profile.estimated_project_cost ? profile.estimated_project_cost : "";
    var incomeOpts = Questions.familyIncomeGroups.map(function (o) {
      return '<option value="' + o.value + '"' + (o.value === curIncome ? " selected" : "") + ">" + optText(o) + "</option>";
    }).join("");
    var eduOpts = Questions.educationStatuses.map(function (o) {
      return '<option value="' + o.value + '"' + (o.value === curEdu ? " selected" : "") + ">" + optText(o) + "</option>";
    }).join("");
    return '<div class="describe-picks sc-quick' + (always ? "" : " hidden") + '" id="scQuick"' + (always ? ' data-always="1"' : "") + ">" +
      '<p class="text-sm text-muted mb-2"><strong>' + I18n.t("questionnaire.sc.title") + "</strong></p>" +
      '<p class="text-sm text-muted mb-3">' + I18n.t("questionnaire.sc.why") + "</p>" +
      '<div class="mb-3"><p class="text-sm text-muted mb-2">' + I18n.t("profile.familyIncome") + "</p>" +
      '<select id="scIncome" class="form-select"><option value="">-</option>' + incomeOpts + "</select></div>" +
      '<div class="mb-3"><p class="text-sm text-muted mb-2">' + I18n.t("profile.educationStatus") + "</p>" +
      '<select id="scEducation" class="form-select"><option value="">-</option>' + eduOpts + "</select></div>" +
      '<div class="mb-3"><p class="text-sm text-muted mb-2">' + I18n.t("profile.projectCost") + "</p>" +
      '<input id="scCost" type="number" class="form-select" min="0" step="10000" value="' + (curCost || "") + '" placeholder="150000"></div>' +
      "</div>";
  }

  function toggleScQuick() {
    var box = document.getElementById("scQuick");
    if (!box || box.dataset.always === "1") return;
    box.classList.toggle("hidden", currentCategoryPick() !== "sc");
  }

  function currentCategoryPick() {
    if (!needCategoryPick()) return profile.social_category;
    var checked = document.querySelector('#categoryChips input[name="dsc"]:checked');
    return checked ? checked.value : null;
  }

  function currentStatePick() {
    var sel = document.getElementById("describeState");
    if (sel) return sel.value;
    return profile && profile.state ? profile.state : null;
  }

  function applyDescription(u) {
    if (!Auth.token()) return;
    var category = currentCategoryPick();
    var state = currentStatePick();
    var income = "";
    var edu = "";
    var cost = 0;
    if (category === "sc") {
      var incomeEl = document.getElementById("scIncome");
      var eduEl = document.getElementById("scEducation");
      var costEl = document.getElementById("scCost");
      income = incomeEl ? incomeEl.value : "";
      edu = eduEl ? eduEl.value : "";
      var costRaw = costEl ? costEl.value.trim() : "";
      cost = costRaw ? Number(costRaw) : 0;
    }
    var mount = document.getElementById("questionMount");
    mount.innerHTML = '<div class="question-card text-center py-4"><div class="spinner"></div>' +
      '<p class="mt-3 text-muted">' + I18n.t("questionnaire.describe.applying") + "</p></div>";
    var payload = { description: describeText, language: I18n.current() };
    if (u.project_type) payload.project_type = u.project_type;
    if (category) payload.social_category = category;
    if (state) payload.state = state;
    if (category === "sc") {
      if (!income || !edu || !cost || cost <= 0) {
        mount.innerHTML = '<div class="question-card text-center py-4"><p class="text-muted">' +
          I18n.t("profile.sc.required") + "</p>" +
          '<button class="btn btn-secondary mt-3" id="applyRetryBtn">' + I18n.t("common.back") + "</button></div>";
        document.getElementById("applyRetryBtn").addEventListener("click", function () { renderDescribeSummary(u); });
        return;
      }
      payload.annual_family_income = income;
      payload.education_status = edu;
      payload.estimated_project_cost = cost;
    }
    API.post("/api/ai/apply-from-description", payload, Auth.token())
      .then(function () {
        saveDraft("summary");
        window.location.href = "/my-schemes";
      })
      .catch(function (err) {
        mount.innerHTML = '<div class="question-card text-center py-4"><p class="text-muted">' +
          (err && err.message ? err.message : I18n.t("questionnaire.describe.failed")) + "</p>" +
          '<button class="btn btn-secondary mt-3" id="applyRetryBtn">' + I18n.t("common.next") + "</button></div>";
        document.getElementById("applyRetryBtn").addEventListener("click", function () { renderDescribeSummary(u); });
      });
  }

  function loadForm() {
    var token = Auth.token();
    return API.post("/api/questionnaire/dynamic", { answers: answers }, token)
      .then(function (dyn) {
        buildSteps((dyn && dyn.questions) || []);
        if (step >= STEP_TOTAL) step = STEP_TOTAL - 1;
        render();
      })
      .catch(function () {
        buildSteps([]);
        if (step >= STEP_TOTAL) step = STEP_TOTAL - 1;
        render();
      });
  }

  function buildSteps(dynamicQuestions) {
    steps = [];
    if (!profile) {
      var cat = Questions.find("entrepreneur_type");
      if (cat) steps.push(cat);
    }
    var dyn = dynamicQuestions || [];
    dyn.forEach(function (q) { steps.push(q); });
    ["financial", "non_financial", "description"].forEach(function (id) {
      if (POST_PROFILE_IDS[id]) {
        var q = Questions.find(id);
        if (q) steps.push(q);
      }
    });
    if (!profileHasScFields()) {
      SC_IDS.forEach(function (id) {
        var q = Questions.find(id);
        if (q) steps.push(q);
      });
    }
    FINAL_IDS.forEach(function (id) {
      var q = Questions.find(id);
      if (q) steps.push(q);
    });
    STEP_TOTAL = steps.length;
  }

  function autoNote() {
    var filled = [];
    PROFILE_LOOKUP.forEach(function (l) { if (prefilledValue(l)) filled.push(l.labelKey); });
    if (!filled.length) return "";

    var chips = filled.map(function (k) {
      return '<span class="tag-chip">' + I18n.t(k) + " ✓</span>";
    }).join(" ");
    var sub = I18n.t("questionnaire.auto.sub", { sector: sectorLabel(profile ? profile.business_sector : "") || "" });
    return '<div class="auto-fill-note">' +
      '<p class="text-sm text-muted mb-2"><strong>' + I18n.t("questionnaire.auto.title") + "</strong></p>" +
      '<p class="text-sm mb-2">' + sub + "</p>" +
      '<p class="mb-0">' + chips + "</p>" +
      "</div>";
  }

  var persistTimer = null;
  function schedulePersist() {
    if (!Auth.token()) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(function () { persist(); }, 600);
  }

  function persist(cb) {
    if (!Auth.token()) {
      if (cb) cb();
      return;
    }
    API.put("/api/questionnaire/progress", { answers: answers, step: step }, Auth.token())
      .then(function () { if (cb) cb(); })
      .catch(function () { if (cb) cb(); });
  }

  function saveDraft(scene) {
    try {
      AppStore.saveDescribeDraft({ text: describeText || "", scene: scene || "describe", savedAt: Date.now() });
    } catch (e) {}
  }

  function clearDraft() {
    try {
      AppStore.clearDescribeDraft();
    } catch (e) {}
  }

  function restoreDraft() {
    var d = null;
    try { d = AppStore.getDescribeDraft(); } catch (e) {}
    if (!d || !d.text) return false;
    mode = "describe";
    describeText = d.text || "";
    renderDescribe();
    if (d.scene === "summary") {
      setTimeout(function () {
        if (profile && profile.ai_confirmed) {
          renderDescribeSummary({
            sector: profile.ai_sector,
            stage: profile.business_stage || "new",
            support_needs: profile.support_needs || [],
            tags: profile.ai_tags || [],
            summary_en: "",
            summary_hi: ""
          });
        } else {
          analyzeText(describeText);
        }
      }, 60);
    }
    return true;
  }

  function render() {
    while (step < STEP_TOTAL && steps[step] && steps[step].scOnly && !isScCategory()) {
      step++;
    }
    if (step >= STEP_TOTAL) {
      renderHeader();
      submit();
      return;
    }
    var q = steps[step];
    var mount = document.getElementById("questionMount");
    var title = I18n.loc(q.title);
    var help = q.help ? I18n.loc(q.help) : "";
    var savedValue = answers[q.id];

    var body = "";
    if (q.type === "review") {
      body = "<div class=\"card mb-4\"><h3 class=\"mb-3\">" + title + "</h3>" + buildReview() + "</div>";
    } else if (q.type === "understand") {
      body = '<div id="understandingMount"></div>';
    } else if (q.type === "textarea") {
      body = '<textarea id="q-input" rows="4" placeholder="' + help + '">' + (savedValue || "") + "</textarea>";
    } else if (q.type === "text") {
      body = '<input id="q-input" type="text" placeholder="' + help + '" value="' + (savedValue || "") + '" autocomplete="off">';
    } else if (q.type === "num") {
      body = '<input id="q-input" type="number" min="0" step="10000" placeholder="' + help + '" value="' + (savedValue || "") + '" autocomplete="off">';
    } else {
      var opts = optionsFor(q);
      var fields = "";
      opts.forEach(function (o) {
        var checked = "";
        if (q.type === "multi") {
          checked = (savedValue || []).indexOf(o.value) !== -1 ? " checked" : "";
        } else {
          checked = savedValue === o.value ? " checked" : "";
        }
        var input = q.type === "multi" ? "checkbox" : "radio";
        fields += '<label class="option-' + (q.type === "multi" ? "checkbox" : "radio") + '">' +
          '<input type="' + input + '" name="q" value="' + o.value + '"' + checked + "> " + optText(o) + "</label>";
      });
      body = fields;
    }

    var auto = step === 0 && q.type !== "review" && q.type !== "understand" ? autoNote() : "";

    mount.innerHTML =
      '<div class="question-card fade-in">' +
      auto +
      '<h2 class="question-text">' + title + "</h2>" +
      (help && (q.type === "num" || (q.type !== "textarea" && q.type !== "text")) ? '<p class="mb-4">' + help + "</p>" : "") +
      body +
      '<div class="question-actions">' +
      (step > 0 ? '<button class="btn btn-secondary" id="prevBtn">' + I18n.t("common.previous") + "</button>" : '<a class="btn btn-secondary" href="/home">' + I18n.t("common.cancel") + "</a>") +
      (q.type === "textarea" ? '<button class="btn btn-ghost" id="skipTextBtn">' + I18n.t("common.skip") + "</button>" : "") +
      '<button class="btn ' + (q.type === "review" ? "btn-primary btn-lg" : "btn-primary") + '" id="nextBtn">' + (q.type === "review" ? I18n.t("questionnaire.finish") : I18n.t("common.next")) + "</button>" +
      "</div></div>";

    renderHeader();

    document.getElementById("nextBtn").addEventListener("click", onNext);
    var prev = document.getElementById("prevBtn");
    if (prev) prev.addEventListener("click", function () { step--; scrollTop(); render(); });
    var skipText = document.getElementById("skipTextBtn");
    if (skipText) skipText.addEventListener("click", function () {
      answers[q.id] = "";
      var inputEl = document.getElementById("q-input");
      if (inputEl) inputEl.value = "";
      onNext();
    });

    if (q.type === "understand") {
      renderUnderstand(q);
    } else if (q.type !== "review") {
      bindLive(q);
    }
  }

  function bindLive(q) {
    var inputs = document.querySelectorAll('#questionMount input[name="q"]');
    Array.prototype.forEach.call(inputs, function (i) {
      i.addEventListener("change", function () {
        collect();
        renderHeader();
        schedulePersist();
      });
    });
    var inputEl = document.getElementById("q-input");
    if (inputEl) {
      inputEl.addEventListener("input", function () {
        answers[q.id] = textValue();
        renderHeader();
        schedulePersist();
      });
    }
  }

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function collect() {
    var q = steps[step];
    if (q.type === "review" || q.type === "understand") return;
    if (q.type === "textarea" || q.type === "text" || q.type === "num") {
      answers[q.id] = textValue();
      return;
    }
    var inputs = document.querySelectorAll('#questionMount input[name="q"]');
    if (q.type === "multi") {
      answers[q.id] = selectedValues(inputs);
    } else {
      var checked = Array.prototype.slice.call(inputs).filter(function (i) { return i.checked; });
      answers[q.id] = checked.length ? checked[0].value : null;
    }
  }

  function hasValue(q) {
    var v = answers[q.id];
    if (q.type === "review") return true;
    if (q.type === "understand") return !!(v && v.understand_confirmed === true);
    if (q.type === "textarea") return true;
    if (q.type === "text") return !!(v && String(v).trim());
    if (q.type === "multi") return v && v.length > 0;
    return !!v;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function understandingSummary(u) {
    return I18n.summary(u);
  }

  function understandNeeds() {
    return [].concat(answers.financial || []).concat(answers.non_financial || []);
  }

  // The understanding is driven by the marked answers; the free-text description
  // is optional and only enriches it. This payload always carries the options the
  // user actually selected so the backend never depends on a description.
  function understandFormPayload(desc) {
    function pick(k) {
      var v = answers[k];
      if (v === undefined || v === null || v === "") v = profile ? profile[k] : null;
      return v;
    }
    var cost = answers.estimated_project_cost;
    if ((cost === undefined || cost === null || cost === "") && profile) cost = profile.estimated_project_cost;
    return {
      sector: pick("business_sector") || null,
      stage: pick("business_stage") || null,
      support_needs: understandNeeds(),
      project_type: pick("project_type") || null,
      annual_revenue: pick("annual_revenue") || null,
      estimated_project_cost: (cost === undefined || cost === null || cost === "") ? null : cost,
      description: desc || null,
      language: I18n.current()
    };
  }

  // Signature of the answers that produced an understanding, so a saved/draft
  // result is only reused while its inputs are unchanged.
  function understandFormKey(desc) {
    return [
      answers.business_sector,
      answers.business_stage,
      answers.project_type,
      answers.annual_revenue,
      answers.estimated_project_cost,
      understandNeeds().join(","),
      desc || ""
    ].join("|");
  }

  function draftMatches(savedOrDraft, desc) {
    if (!savedOrDraft) return false;
    // Reject stale/foreign draft shapes (non-string summaries) so they are
    // refetched clean instead of rendering as "[object Object]".
    var sums = [savedOrDraft.summary_en, savedOrDraft.summary_hi, savedOrDraft.summary_loc];
    for (var i = 0; i < sums.length; i++) {
      if (sums[i] !== undefined && sums[i] !== null && typeof sums[i] !== "string") return false;
    }
    if (!savedOrDraft.summary_en) return false;
    if (savedOrDraft.bootKey !== undefined) return savedOrDraft.bootKey === understandFormKey(desc);
    return savedOrDraft.description === desc;
  }

  function renderUnderstand(q) {
    var mount = document.getElementById("understandingMount");
    if (!mount) return;
    var desc = answers.description || "";
    var saved = answers.understand || null;
    if (saved && saved.understand_confirmed === true && draftMatches(saved, desc)) {
      renderUnderstandingResult(mount, saved, true);
      return;
    }
    var draft = answers._understandDraft || null;
    if (draft && draftMatches(draft, desc)) {
      renderUnderstandingResult(mount, draft, false);
      return;
    }
    mount.innerHTML = '<div class="text-center py-4"><div class="spinner"></div><p class="mt-3 text-muted">' + I18n.t("questionnaire.understand.think") + "</p></div>";
    API.post("/api/ai/understand-form", understandFormPayload(desc), Auth.token())
      .then(function (u) {
        answers._understandDraft = {
          description: desc,
          bootKey: understandFormKey(desc),
          sector: u.sector,
          tags: u.tags || [],
          project_type: u.project_type || null,
          summary_en: u.summary_en || "",
          summary_hi: u.summary_hi || "",
          summary_loc: u.summary_loc || ""
        };
        persist();
        renderUnderstandingResult(mount, u, false);
      })
      .catch(function () {
        mount.innerHTML = '<p class="text-muted">' + I18n.t("questionnaire.understand.failed") + "</p>";
      });
  }

  function renderUnderstandingResult(mount, u, confirmed) {
    u = u || {};
    var summary = understandingSummary(u) || I18n.t("questionnaire.understand.noSummary");
    var sector = sectorLabel(typeof u.sector === "string" ? u.sector : "");
    var tags = Array.isArray(u.tags) ? u.tags : [];
    var empty = "";
    if (!summary) empty = " empty-result";

    var html = '<div class="understanding-tip">';
    if (confirmed) {
      html += '<p class="understanding-confirmed-note">' + I18n.t("questionnaire.understand.confirmed") + "</p>";
    }
    html += "<h3 class=\"question-text\" style=\"font-size:1.05rem\">" + I18n.t("questionnaire.understand.explain") + "</h3>";
    html += '<p class="understanding-summary' + empty + '">' + (summary ? escapeHtml(summary) : "—") + "</p>";
    if (sector) {
      html += '<p class="understanding-row"><span class="understanding-label">' + I18n.t("questionnaire.understand.sector") + "</span> <strong>" + escapeHtml(sector) + "</strong></p>";
    }
    if (u.project_type) {
      html += '<p class="understanding-row"><span class="understanding-label">' + I18n.t("profile.projectType") + "</span> <strong>" +
        escapeHtml(I18n.t("projectType." + u.project_type) || u.project_type) + "</strong></p>";
    }
    if (tags.length) {
      html += '<p class="understanding-row"><span class="understanding-label">' + I18n.t("questionnaire.understand.tags") + "</span> " +
        tags.map(function (t) { return '<span class="tag-chip">' + escapeHtml(t) + "</span>"; }).join(" ") + "</p>";
    }
    html += '<div class="question-actions" style="margin-top:var(--space-4);justify-content:flex-start">' +
      '<button class="btn btn-primary" id="understandYesBtn">' + I18n.t("questionnaire.understand.yes") + "</button>" +
      '<button class="btn btn-secondary" id="understandNoBtn">' + I18n.t("questionnaire.understand.no") + "</button>" +
      '<button class="btn btn-ghost" id="understandSkipBtn">' + I18n.t("common.skip") + "</button>" +
      "</div>" +
      '<div class="under-edit hidden" id="understandingEdit">' +
      '<p class="text-sm text-muted mb-2">' + I18n.t("questionnaire.understand.edit") + "</p>" +
      '<textarea id="understandText" rows="4">' + escapeHtml(answers.description || "") + "</textarea>" +
      '<div class="question-actions" style="margin-top:var(--space-3);justify-content:flex-start">' +
      '<button class="btn btn-primary" id="understandReBtn">' + I18n.t("questionnaire.understand.reunderstand") + "</button>" +
      '<button class="btn btn-secondary" id="understandCancelBtn">' + I18n.t("common.cancel") + "</button>" +
      "</div></div></div>";

    mount.innerHTML = html;

    document.getElementById("understandYesBtn").addEventListener("click", function () { confirmUnderstanding(u); });
    document.getElementById("understandSkipBtn").addEventListener("click", function () { confirmUnderstanding(u); });
    var noBtn = document.getElementById("understandNoBtn");
    noBtn.addEventListener("click", function () {
      document.getElementById("understandingEdit").classList.remove("hidden");
      noBtn.disabled = true;
    });
    document.getElementById("understandReBtn").addEventListener("click", reunderstand);
    document.getElementById("understandCancelBtn").addEventListener("click", function () {
      renderUnderstandingResult(mount, u, confirmed);
    });
  }

  function confirmUnderstanding(u) {
    if (!Auth.token()) return;
    var desc = answers.description || "";
    var bootKey = understandFormKey(desc);
    API.post("/api/ai/confirm", {
      description: desc || null,
      sector: u.sector || null,
      tags: u.tags || [],
      stage: u.stage || null,
      support_needs: u.support_needs || [],
      project_type: u.project_type || null,
      summary_en: u.summary_en || "",
      summary_hi: u.summary_hi || ""
    }, Auth.token())
      .then(function (res) {
        answers.understand = {
          understand_confirmed: true,
          description: desc,
          bootKey: bootKey,
          sector: res.sector,
          tags: res.tags || u.tags || [],
          stage: res.stage || u.stage || null,
          support_needs: res.support_needs || u.support_needs || [],
          project_type: (res && res.project_type) || u.project_type || null,
          summary_en: res.summary_en,
          summary_hi: res.summary_hi
        };
        answers.project_type = answers.understand.project_type || answers.project_type;
        answers._understandDraft = null;
        persist();
        renderHeader();
        Notify.show(I18n.t("questionnaire.understand.confirmed"), "success", 1500);
        step++;
        scrollTop();
        render();
      })
      .catch(function (err) {
        Notify.error(err && err.message ? err.message : I18n.t("questionnaire.understand.failed"));
      });
  }

  function reunderstand() {
    var ta = document.getElementById("understandText");
    var text = ta ? ta.value.trim() : "";
    answers.description = text;
    answers.understand = null;
    answers._understandDraft = null;
    persist();
    var mount = document.getElementById("understandingMount");
    if (!mount) return;
    mount.innerHTML = '<div class="text-center py-4"><div class="spinner"></div><p class="mt-3 text-muted">' + I18n.t("questionnaire.understand.think") + "</p></div>";
    var desc = answers.description || "";
    var bootKey = understandFormKey(desc);
    API.post("/api/ai/understand-form", understandFormPayload(desc), Auth.token())
      .then(function (u) {
        answers._understandDraft = {
          description: desc,
          bootKey: bootKey,
          sector: u.sector,
          tags: u.tags || [],
          project_type: u.project_type || null,
          summary_en: u.summary_en || "",
          summary_hi: u.summary_hi || "",
          summary_loc: u.summary_loc || ""
        };
        persist();
        renderUnderstandingResult(mount, u, false);
      })
      .catch(function () { mount.innerHTML = '<p class="text-muted">' + I18n.t("questionnaire.understand.failed") + "</p>"; });
  }

  function onNext() {
    var q = steps[step];
    if (q.type !== "review") {
      collect();
      if (!hasValue(q)) {
        Notify.warning(I18n.t("common.required"));
        return;
      }
      persist();
      Notify.show(I18n.t("questionnaire.toast.saved"), "success", 1200);
    }
    step++;
    if (step >= STEP_TOTAL) {
      renderHeader();
      buildReview();
      submit();
      return;
    }
    scrollTop();
    render();
  }

  function displayValue(q, val) {
    if (val === undefined || val === null || val === "") return "—";
    if (q.type === "multi") {
      return ([]).concat(val).map(function (v) {
        var o = optionsFor(q).filter(function (x) { return x.value === v; })[0];
        return o ? optText(o) : v;
      }).join(", ") || "—";
    }
    var o = optionsFor(q).filter(function (x) { return x.value === val; })[0];
    return o ? optText(o) : String(val);
  }

  function reviewItem(label, display) {
    return '<div class="breakdown-item"><span class="text-sm">' + label + "</span><strong class=\"text-sm\">" + display + "</strong></div>";
  }

  function buildReview() {
    var html = '<div class="card" style="text-align:left"><h3 class="mb-4">' + I18n.t("questionnaire.review") + "</h3>";

    if (profileFilledCount()) {
      html += '<h4 class="text-sm text-muted mb-2">' + I18n.t("questionnaire.review.fromProfile") + "</h4>";
      PROFILE_LOOKUP.forEach(function (l) {
        var raw = prefilledValue(l);
        if (!raw) return;
        var q = Questions.find(l.id);
        if (!q) return;
        var display = l.kind === "category"
          ? (function () { var o = optionsFor(q).filter(function (x) { return x.value === answers[l.id]; })[0]; return o ? optText(o) : (answers[l.id] || raw); })()
          : displayValue(q, answers[l.id]);
        html += reviewItem(I18n.loc(q.title), display);
      });
    }

    for (var i = 0; i < steps.length; i++) {
      var q = steps[i];
      if (q.type === "review" || q.type === "textarea") continue;
      var val = answers[q.id];
      var labelText = I18n.loc(q.title);
      html += reviewItem(labelText, displayValue(q, val));
    }
    if (answers.description) {
      html += reviewItem(I18n.t("profile.description"), escapeHtml(answers.description));
    }
    if (answers.understand && answers.understand.understand_confirmed === true) {
      var ua = answers.understand;
      var usum = I18n.summary(ua);
      if (usum) {
        html += reviewItem(I18n.t("questionnaire.understand.label"), escapeHtml(usum));
      }
    }
    return html + "</div>";
  }

  function positionPercent() {
    var total = STEP_TOTAL - 1;
    return total > 0 ? Math.round((step / total) * 100) : 0;
  }

  function renderHeader() {
    var ring = document.getElementById("progressRing");
    if (ring) {
      ProgressRing.render(ring, { size: 96, stroke: 8, value: positionPercent(), label: I18n.t("questionnaire.ring") });
    }
    var label = document.getElementById("stepLabel");
    if (label) {
      if (STEP_TOTAL > 0) {
        label.textContent = I18n.t("questionnaire.sub", { step: step + 1, total: STEP_TOTAL });
      } else {
        label.textContent = I18n.t("questionnaire.startLabel");
      }
    }
    var counter = document.getElementById("markedCounter");
    if (counter) {
      if (STEP_TOTAL > 0) {
        counter.textContent = I18n.t("questionnaire.marked", { pct: answeredPercent() });
      } else {
        counter.textContent = "";
      }
    }
  }

  function submit() {
    if (!Auth.requireLogin()) return;

    step = STEP_TOTAL - 1;
    persist();

    var etVal = ([]).concat(answers.entrepreneur_type || []);
    var socialCategory = etVal.length ? etVal[0] : (profile && profile.social_category ? profile.social_category : "general");
    if (["sc", "st", "obc", "pwd"].indexOf(socialCategory) === -1) socialCategory = "general";

    var projCostRaw = answers.estimated_project_cost;
    var projCost = null;
    if (projCostRaw !== undefined && projCostRaw !== null && String(projCostRaw).trim() !== "") {
      var n = Number(projCostRaw);
      projCost = isNaN(n) ? null : n;
    }

    var payload = {
      full_name: answers.full_name || "",
      phone_number: answers.phone_number || "",
      age_group: answers.age_group || "",
      gender: answers.gender || "other",
      social_category: socialCategory,
      annual_family_income: answers.annual_family_income || "",
      education_status: answers.education_status || "not_applicable",
      estimated_project_cost: projCost,
      project_type: answers.project_type || (profile && profile.project_type) || "business",
      sector: answers.business_sector,
      business_sector: answers.business_sector,
      state: answers.state,
      business_stage: answers.business_stage,
      annual_revenue: answers.annual_revenue,
      entrepreneur_type: ([]).concat(answers.entrepreneur_type || []).join(",") || null,
      support_needs: ([]).concat(answers.financial || [], answers.non_financial || [])
    };

    var mount = document.getElementById("questionMount");
    mount.innerHTML = '<div style="text-align:center;padding:var(--space-7) 0"><div class="spinner"></div><p class="mt-4">' + I18n.t("common.loading") + "</p></div>";

    var token = Auth.token();

    function done() {
      window.location.href = "/my-schemes";
    }

    API.get("/api/profile", token, { skipAuthRedirect: true })
      .then(function (profile) {
        return API.put("/api/profile", Object.assign({}, payload, {
          full_name: answers.full_name || profile.full_name || "",
          phone_number: answers.phone_number || profile.phone_number || "",
          age_group: answers.age_group || profile.age_group || "",
          gender: answers.gender || profile.gender || "other",
          social_category: socialCategory || profile.social_category || "general",
          sector: undefined,
          business_name: profile.business_name || "",
          district: profile.district || "",
          employee_count: profile.employee_count || "",
          description: answers.description || profile.description || ""
        }), token);
      })
      .catch(function () {
        return API.post("/api/profile", Object.assign({}, payload, {
          business_name: "", district: "", employee_count: "",
          description: answers.description || ""
        }), token);
      })
      .then(done)
      .catch(function (err) {
        Notify.error(err.message);
        window.location.href = "/my-schemes";
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!Auth.requireLogin()) return;

    var token = Auth.token();

    API.get("/api/profile", token, { skipAuthRedirect: true })
      .then(function (p) { profile = p; })
      .catch(function () { profile = null; })
      .then(function () {
        return API.get("/api/questionnaire/progress", token, { skipAuthRedirect: true });
      })
      .then(function (prog) {
        answers = (prog && prog.answers && typeof prog.answers === "object") ? prog.answers : {};
        step = (prog && typeof prog.step === "number") ? prog.step : 0;
        var hasStarted = step > 0 || Object.keys(answers).length > 0;
        if (hasStarted) {
          mode = "form";
          prefillFromProfile();
          return loadForm();
        }
        if (restoreDraft()) return;
        renderGate();
      })
      .catch(function () {
        answers = {};
        step = 0;
        if (restoreDraft()) return;
        renderGate();
      });
  });
})();