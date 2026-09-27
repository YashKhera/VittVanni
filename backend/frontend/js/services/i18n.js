(function () {
  "use strict";

  var LANG_KEY = "language";

  var LANGUAGES = {
    en:   { name: "English",      roman: "English",      group: "common", dir: "ltr", detect: ["en"] },
    hi:   { name: "हिंदी",         roman: "Hindi",         group: "common", dir: "ltr", detect: ["hi"] },
    pa:   { name: "ਪੰਜਾਬੀ",        roman: "Punjabi",       group: "north", dir: "ltr", detect: ["pa", "pnb"] },
    ur:   { name: "اردو",          roman: "Urdu",          group: "north", dir: "rtl", detect: ["ur", "urd"] },
    ks:   { name: "कॉशुर",         roman: "Kashmiri",      group: "north", dir: "ltr", detect: ["ks"] },
    doi:  { name: "डोगरी",         roman: "Dogri",         group: "north", dir: "ltr", detect: ["doi"] },
    sd:   { name: "سنڌي",          roman: "Sindhi",        group: "north", dir: "rtl", detect: ["sd"] },
    ne:   { name: "नेपाली",         roman: "Nepali",        group: "north", dir: "ltr", detect: ["ne"] },
    ta:   { name: "தமிழ்",         roman: "Tamil",         group: "south", dir: "ltr", detect: ["ta"] },
    te:   { name: "తెలుగు",         roman: "Telugu",        group: "south", dir: "ltr", detect: ["te"] },
    kn:   { name: "ಕನ್ನಡ",         roman: "Kannada",       group: "south", dir: "ltr", detect: ["kn"] },
    ml:   { name: "മലയാളം",         roman: "Malayalam",     group: "south", dir: "ltr", detect: ["ml"] },
    bn:   { name: "বাংলা",          roman: "Bengali",       group: "east", dir: "ltr", detect: ["bn"] },
    as:   { name: "অসমীয়া",         roman: "Assamese",      group: "east", dir: "ltr", detect: ["as"] },
    or:   { name: "ଓଡ଼ିଆ",          roman: "Odia",          group: "east", dir: "ltr", detect: ["or", "od"] },
    mai:  { name: "मैथिली",         roman: "Maithili",      group: "east", dir: "ltr", detect: ["mai"] },
    mni:  { name: "ꯃꯤꯇꯩꯂꯣꯟ",      roman: "Manipuri",      group: "north_east", dir: "ltr", detect: ["mni", "mni-Mtei"] },
    sat:  { name: "ᱥᱟᱱᱛᱟᱲᱤ",        roman: "Santali",       group: "north_east", dir: "ltr", detect: ["sat"] },
    brx:  { name: "बड़ो",           roman: "Bodo",          group: "north_east", dir: "ltr", detect: ["brx"] },
    mr:   { name: "मराठी",          roman: "Marathi",       group: "west", dir: "ltr", detect: ["mr"] },
    gu:   { name: "ગુજરાતી",        roman: "Gujarati",      group: "west", dir: "ltr", detect: ["gu"] },
    kok:  { name: "कोंकणी",         roman: "Konkani",       group: "west", dir: "ltr", detect: ["kok"] },
    sa:   { name: "संस्कृतम्",       roman: "Sanskrit",      group: "west", dir: "ltr", detect: ["sa"] }
  };

  var GROUPS = [
    { id: "common", en: "English & Hindi", hi: "अंग्रेज़ी और हिंदी" },
    { id: "north", en: "North India", hi: "उत्तर भारत" },
    { id: "south", en: "South India", hi: "दक्षिण भारत" },
    { id: "east", en: "East India", hi: "पूर्वी भारत" },
    { id: "north_east", en: "North-East", hi: "पूर्वोत्तर" },
    { id: "west", en: "West & Central", hi: "पश्चिम एवं मध्य" }
  ];

  function normalize(code) {
    if (!code) return null;
    var c = String(code).toLowerCase().split("-")[0].trim();
    if (LANGUAGES[c]) return c;
    for (var k in LANGUAGES) {
      var d = LANGUAGES[k].detect;
      if (d.indexOf(String(code).toLowerCase()) !== -1) return k;
    }
    return null;
  }

  function detect() {
    if (window.navigator && navigator.language) {
      var list = navigator.languages ? navigator.languages.slice() : [navigator.language];
      for (var i = 0; i < list.length; i++) {
        var c = normalize(list[i]);
        if (c) return c;
        var base = String(list[i]).toLowerCase().split("-")[0];
        if (LANGUAGES[base]) return base;
      }
    }
    return "en";
  }

  function i18nDir() {
    return "/js/i18n/lang/";
  }

  function loadSync(code) {
    if (window.Translations && Translations[code]) return true;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", i18nDir() + code + ".js", false);
      xhr.send(null);
      if (xhr.status === 200 && xhr.responseText) {
        (0, eval)(xhr.responseText);
        return !!(window.Translations && Translations[code]);
      }
    } catch (e) {}
    return false;
  }

  function loadAsync(code, cb) {
    if (window.Translations && Translations[code]) { if (cb) cb(); return; }
    var s = document.createElement("script");
    s.src = i18nDir() + code + ".js";
    s.onload = function () { if (cb) cb(); };
    s.onerror = function () { if (cb) cb(); };
    document.head.appendChild(s);
  }

  function currentRaw() {
    return VStore.get(LANG_KEY, null);
  }

  function applyDocumentLang(lang) {
    var meta = LANGUAGES[lang] || LANGUAGES.en;
    document.documentElement.lang = lang;
    document.documentElement.dir = meta.dir || "ltr";
  }

  // Coerce any value to displayable text. Objects/arrays (stale drafts,
  // unexpected API shapes) become their readable strings instead of
  // "[object Object]"; anything unusable becomes "".
  function toText(v, lang) {
    if (v === undefined || v === null) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) {
      return v.map(function (x) { return toText(x, lang); })
        .filter(function (x) { return !!x; }).join(" ");
    }
    if (typeof v === "object") {
      return toText(v[lang], lang) || toText(v.en, lang) || toText(v.hi, lang) || "";
    }
    return String(v);
  }

  var bootLang = (function () {
    var stored = currentRaw();
    if (stored && LANGUAGES[stored]) return stored;
    var d = detect();
    VStore.set(LANG_KEY, d);
    return d;
  })();
  applyDocumentLang(bootLang);
  loadSync(bootLang);

  window.I18n = {
    LANGUAGES: LANGUAGES,
    GROUPS: GROUPS,

    current: function () {
      var stored = currentRaw();
      if (stored && LANGUAGES[stored]) return stored;
      var d = detect();
      VStore.set(LANG_KEY, d);
      return d;
    },

    detect: detect,

    isRTL: function () {
      return (LANGUAGES[this.current()] || {}).dir === "rtl";
    },

    init: function () {
      var lang = this.current();
      applyDocumentLang(lang);
      loadSync(lang);
      var self = this;
      window.setTimeout(function () {
        try {
          if (window.Auth && window.API && Auth.isLoggedIn() && !VStore.get("langPrev", null)) {
            API.get("/api/preferences", Auth.token())
              .then(function (p) {
                if (p && p.language && p.language !== "en" && LANGUAGES[p.language] &&
                    VStore.get(LANG_KEY, null) === lang) {
                  self.setLanguage(p.language);
                }
              })
              .catch(function () {});
          }
        } catch (e) {}
      }, 50);
    },

    setLanguage: function (lang) {
      if (!LANGUAGES[lang]) lang = "en";
      VStore.set(LANG_KEY, lang);
      VStore.set("langPrev", "1");
      applyDocumentLang(lang);
      var self = this;
      var done = function () {
        self.apply();
        window.dispatchEvent(new Event("languagechange"));
        try {
          if (window.Auth && window.API && Auth.isLoggedIn() && Auth.token()) {
            API.put("/api/preferences", { language: lang }, Auth.token()).catch(function () {});
          }
        } catch (e) {}
      };
      if (window.Translations && Translations[lang]) {
        done();
      } else {
        loadAsync(lang, done);
      }
    },

    t: function (key, params) {
      var lang = this.current();
      var dict = (window.Translations && Translations[lang]) || {};
      var fallback = (window.Translations && Translations.en) || {};
      var text = dict[key] || fallback[key] || key;
      if (params) {
        text = text.replace(/\{(\w+)\}/g, function (m, k) {
          return params[k] !== undefined ? params[k] : m;
        });
      }
      return text;
    },

    loc: function (o) {
      if (!o) return "";
      if (typeof o === "string") return o;
      return o[this.current()] || o.hi || o.en || "";
    },

    summary: function (u) {
      if (!u) return "";
      var lang = this.current();
      var loc = toText(u.summary_loc, lang);
      if (loc) return loc;
      if (lang === "hi") return toText(u.summary_hi, lang) || toText(u.summary_en, lang);
      return toText(u.summary_en, lang) || toText(u.summary_hi, lang);
    },

    optionsHtml: function () {
      var lang = this.current();
      var html = '<option value="' + lang + '">' + (LANGUAGES[lang] ? LANGUAGES[lang].name : "English") + "</option>";
      GROUPS.forEach(function (g) {
        var codes = [];
        for (var k in LANGUAGES) {
          if (LANGUAGES[k].group === g.id) codes.push(k);
        }
        if (!codes.length) return;
        html += '<optgroup label="' + (lang === "hi" ? (g.hi || g.en) : g.en) + '">';
        codes.forEach(function (c) {
          var m = LANGUAGES[c];
          if (c === lang) return;
          html += '<option value="' + c + '">' + m.name + "</option>";
        });
        html += "</optgroup>";
      });
      return html;
    },

    apply: function () {
      var lang = this.current();
      applyDocumentLang(lang);
      document.querySelectorAll("[data-i18n]").forEach(function (el) {
        var key = el.getAttribute("data-i18n");
        if (key === "landing.hero.h1") {
          el.innerHTML = (window.I18n.t("landing.hero.h1") + " <span class=\"" + el.getAttribute("data-i18n-accent-class") + "\">" + window.I18n.t("landing.hero.h1.accent") + "</span>");
        } else {
          el.textContent = window.I18n.t(key);
        }
      });
      document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
        el.placeholder = window.I18n.t(el.getAttribute("data-i18n-placeholder"));
      });
    }
  };
})();