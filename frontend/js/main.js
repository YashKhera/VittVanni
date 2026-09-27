(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    Theme.set(Theme.current());
    I18n.init();
    I18n.apply();
    installAuthLangSwitch();
    if (window.Auth && Auth.isLoggedIn() && !Auth.user()) {
      Auth.me().then(function () {
        Navbar.render();
      }).catch(function () {
        Auth.logout();
      });
    }
    Navbar.render();
    Footer.render();
  });

  function installAuthLangSwitch() {
    var page = document.body.dataset && document.body.dataset.page;
    if (page !== "login" && page !== "register") return;
    var s = document.createElement("select");
    s.id = "authLangSelect";
    s.innerHTML = I18n.optionsHtml();
    s.className = "no-print";
    s.style.cssText = "position:fixed;top:14px;right:14px;z-index:60;max-width:150px";
    s.setAttribute("aria-label", "Language");
    document.body.appendChild(s);
    if (s.options.length > 0) s.value = I18n.current();
    s.addEventListener("change", function () {
      I18n.setLanguage(s.value);
    });
  }

  window.formatINR = function (num) {
    var rupee = "₹";
    if (num === null || num === undefined) return "";
    if (num >= 10000000) return rupee + (num / 10000000).toFixed(num % 10000000 === 0 ? 0 : 1) + " Cr";
    if (num >= 100000) return rupee + Math.round(num / 100000) + "L";
    if (num >= 1000) return rupee + Math.round(num / 1000) + "K";
    return rupee + Math.round(num);
  };

  window.readQuery = function () {
    var out = {};
    var qs = window.location.search.replace("?", "").split("&");
    qs.forEach(function (kv) {
      if (!kv) return;
      var p = kv.split("=");
      out[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
    });
    return out;
  };
})();