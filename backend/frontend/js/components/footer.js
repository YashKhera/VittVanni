(function () {
  "use strict";

  window.Footer = {
    render: function () {
      var el = document.getElementById("siteFooter");
      if (!el) return;
      var loggedIn = window.Auth && Auth.isLoggedIn();
      var u = window.Auth && Auth.user();
      var isPartner = !!(u && u.role === "partner");
      var links = isPartner
        ? [["/partner", "nav.partnerDash"], ["/partner?tab=inbox", "partner.tab.inbox"], ["/partner?tab=profile", "partner.tab.profile"]]
        : [["/find-schemes", "nav.questions"], ["/my-schemes", "nav.results"], ["/my-applications", "nav.applications"], ["/emi-calculator", "nav.calculator"], ["/partners", "nav.partners"]];
      if (!loggedIn) links = [["/login", "nav.login"], ["/signup", "nav.register"]];
      el.innerHTML =
        '<footer class="footer no-print">' +
        '<div class="container" style="display:flex;flex-wrap:wrap;gap:24px;justify-content:space-between;align-items:flex-start;text-align:left">' +
        '<div style="min-width:220px;flex:1"><p class="gradient-text" style="font-weight:800;font-size:1.1rem;margin-bottom:8px">' + I18n.t("app.name") + "</p>" +
        '<p class="text-sm mb-0" data-i18n="footer.about">' + I18n.t("footer.about") + "</p></div>" +
        '<nav style="display:flex;gap:20px;flex-wrap:wrap" aria-label="Footer">' +
        links.map(function (l) {
          return '<a class="text-sm" href="' + l[0] + '">' + I18n.t(l[1]) + "</a>";
        }).join("") + "</nav></div>" +
        '<div class="container" style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border,#e5e7eb)">' +
        '<p class="text-sm mb-0">&copy; ' + new Date().getFullYear() + " VittVanni. <span data-i18n=\"footer.rights\">" + I18n.t("footer.rights") + "</span></p>" +
        "</div></footer>";
      I18n.apply();
    }
  };
})();

window.Skeleton = {
  show: function (mount, count) {
    count = count || 3;
    mount.innerHTML = "";
    for (var i = 0; i < count; i++) {
      var s = document.createElement("div");
      s.className = "skeleton";
      s.style.height = "120px";
      s.style.marginBottom = "16px";
      mount.appendChild(s);
    }
  }
};