(function () {
  "use strict";

  var STYLE_ID = "sidebar-style";
  var OPEN_KEY = "vittvanni:sidebar";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      ".topbar{position:sticky;top:0;z-index:50;background:var(--bg-primary);color:var(--text-primary);" +
      "border-bottom:1px solid var(--border)}" +
      ".topbar-inner{display:flex;align-items:center;gap:12px;max-width:1200px;" +
      "margin:0 auto;padding:10px 16px}" +
      ".logo-toggle{display:flex;align-items:center;gap:10px;background:none;border:none;" +
      "cursor:pointer;padding:6px 8px;border-radius:10px;color:inherit}" +
      ".logo-toggle:hover{background:var(--bg-secondary)}" +
      ".logo-toggle img{width:30px;height:30px;transition:transform .35s cubic-bezier(.34,1.56,.64,1)}" +
      ".logo-toggle .burger{display:inline-flex;flex-direction:column;gap:4px}" +
      ".logo-toggle .burger span{display:block;width:18px;height:2px;border-radius:2px;" +
      "background:currentColor;transition:transform .3s ease,opacity .3s ease}" +
      "body.sidebar-open .logo-toggle img{transform:rotate(-12deg) scale(1.06)}" +
      ".sidebar-overlay{position:fixed;inset:0;background:rgba(0,0,0,.38);opacity:0;" +
      "pointer-events:none;transition:opacity .3s ease;z-index:60}" +
      "body.sidebar-open .sidebar-overlay{opacity:1;pointer-events:auto}" +
      ".sidebar{position:fixed;top:0;bottom:0;left:0;width:288px;max-width:86vw;z-index:61;" +
      "background:var(--bg-primary);color:var(--text-primary);border-right:1px solid var(--border);" +
      "box-shadow:8px 0 32px rgba(0,0,0,.12);transform:translateX(-105%);visibility:hidden;" +
      "transition:transform .38s cubic-bezier(.32,.72,.24,1),visibility 0s linear .38s;" +
      "display:flex;flex-direction:column}" +
      "body.sidebar-open .sidebar{transform:translateX(0);visibility:visible;transition:transform .38s cubic-bezier(.32,.72,.24,1)}" +
      "[dir=rtl] .sidebar{left:auto;right:0;transform:translateX(105%);border-right:none;" +
      "border-left:1px solid var(--border)}" +
      "[dir=rtl]body.sidebar-open .sidebar{transform:translateX(0)}" +
      ".sidebar-head{padding:22px 20px 14px;border-bottom:1px solid var(--border)}" +
      ".sidebar-brand{font-size:1.25rem;font-weight:800;margin:0 0 14px}" +
      ".sidebar-controls{display:flex;gap:8px;align-items:center}" +
      ".sidebar-controls select{flex:1;min-width:0}" +
      ".sidebar-nav{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:14px}" +
      ".sidebar-nav .nav-link{display:flex;align-items:center;padding:13px 16px;border-radius:12px;" +
      "font-weight:600}" +
      "body.sidebar-open .sidebar-nav .nav-link{animation:slideLink .35s ease backwards}" +
      "@keyframes slideLink{from{transform:translateX(-14px);opacity:0}to{transform:translateX(0);opacity:1}}" +
      "body.sidebar-open .sidebar-nav .nav-link:nth-child(1){animation-delay:.05s}" +
      "body.sidebar-open .sidebar-nav .nav-link:nth-child(2){animation-delay:.09s}" +
      "body.sidebar-open .sidebar-nav .nav-link:nth-child(3){animation-delay:.13s}" +
      "body.sidebar-open .sidebar-nav .nav-link:nth-child(4){animation-delay:.17s}" +
      "body.sidebar-open .sidebar-nav .nav-link:nth-child(5){animation-delay:.21s}" +
      "body.sidebar-open .sidebar-nav .nav-link:nth-child(6){animation-delay:.25s}" +
      "body.sidebar-open .sidebar-nav .nav-link:nth-child(7){animation-delay:.29s}" +
      "body.sidebar-open .sidebar-nav .nav-link:nth-child(8){animation-delay:.33s}" +
      ".sidebar-foot{padding:16px 20px;border-top:1px solid var(--border)}";
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = css;
    document.head.appendChild(st);
  }

  function isPartner() {
    var u = Auth.user();
    return !!(u && u.role === "partner");
  }

  function userLinks() {
    return [
      { href: "/home", key: "nav.home" },
      { href: "/find-schemes", key: "nav.questions" },
      { href: "/my-schemes", key: "nav.results" },
      { href: "/my-applications", key: "nav.applications" },
      { href: "/emi-calculator", key: "nav.calculator" },
      { href: "/saved", key: "nav.saved" },
      { href: "/profile", key: "nav.profile" }
    ];
  }

  function partnerLinks() {
    return [
      { href: "/partner", key: "nav.partnerDash" },
      { href: "/partner?tab=inbox", key: "partner.tab.inbox" },
      { href: "/partner?tab=profile", key: "partner.tab.profile" }
    ];
  }

  function brandName() {
    return isPartner() ? I18n.t("app.partnerName") : I18n.t("app.name");
  }

  window.Navbar = {
    render: function () {
      var header = document.getElementById("navbar");
      if (!header) return;
      injectStyles();
      var loggedIn = Auth.isLoggedIn();
      var currentPath = window.location.pathname || "/";
      if (currentPath === "/") currentPath = "/home";
      var currentFull = currentPath + (window.location.search || "");
      var items = [{ href: "/home", key: "nav.home" }];
      if (loggedIn) items = isPartner() ? partnerLinks() : userLinks();

      var links = items.map(function (item) {
        var itemPath = item.href.split("?")[0];
        var active = (currentPath === itemPath &&
          (item.href.indexOf("?") === -1 || currentFull === item.href)) ? " active" : "";
        return '<a class="nav-link' + active + '" href="' + item.href + '" data-navlink>' + I18n.t(item.key) + "</a>";
      }).join("");

      var authArea = loggedIn
        ? '<button class="btn btn-secondary btn-sm btn-block" id="logoutBtn">' + I18n.t("nav.logout") + "</button>"
        : '<a class="btn btn-ghost btn-sm btn-block" href="/login">' + I18n.t("nav.login") + "</a>" +
          '<a class="btn btn-primary btn-sm btn-block" href="/signup">' + I18n.t("nav.register") + "</a>";

      header.innerHTML =
        '<div class="topbar"><div class="topbar-inner">' +
        '<button class="logo-toggle" id="logoToggle" aria-label="Menu">' +
        '<img src="/assets/logo.svg" alt="VittVanni logo" aria-hidden="true"/>' +
        '<span class="burger" aria-hidden="true"><span></span><span></span><span></span></span>' +
        "</button>" +
        '<span class="gradient-text" style="font-weight:800">' + brandName() + "</span>" +
        '<span style="flex:1"></span>' +
        '<button class="icon-btn" id="themeToggle" aria-label="Toggle theme">' + (Theme.current() === "dark" ? "☀️" : "🌙") + "</button>" +
        "</div></div>";

      // Sidebar + overlay live on <body>, NOT inside the header: the header's
      // backdrop-filter would otherwise trap position:fixed descendants and
      // break the panel layout on every page.
      var overlay = document.getElementById("sidebarOverlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "sidebar-overlay";
        overlay.id = "sidebarOverlay";
        document.body.appendChild(overlay);
      }
      var aside = document.getElementById("sidebar");
      if (!aside) {
        aside = document.createElement("aside");
        aside.className = "sidebar";
        aside.id = "sidebar";
        aside.setAttribute("aria-label", "Site");
        document.body.appendChild(aside);
      }
      aside.innerHTML =
        '<div class="sidebar-head">' +
        '<p class="sidebar-brand gradient-text">' + brandName() + "</p>" +
        '<div class="sidebar-controls">' +
        '<select id="langSelect" aria-label="Language">' + I18n.optionsHtml() + "</select>" +
        "</div></div>" +
        '<nav class="sidebar-nav">' + links + "</nav>" +
        '<div class="sidebar-foot">' + authArea + "</div>";

      var toggle = document.getElementById("logoToggle");
      var overlay = document.getElementById("sidebarOverlay");
      var setOpen = function (open) {
        document.body.classList.toggle("sidebar-open", open);
        try {
          if (open) sessionStorage.setItem(OPEN_KEY, "1");
          else sessionStorage.removeItem(OPEN_KEY);
        } catch (e) {}
      };
      toggle.addEventListener("click", function () {
        setOpen(!document.body.classList.contains("sidebar-open"));
      });
      if (!overlay.__bound) {
        overlay.__bound = true;
        overlay.addEventListener("click", function () {
          document.body.classList.remove("sidebar-open");
        });
      }
      if (!window.__sidebarEscBound) {
        window.__sidebarEscBound = true;
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape") document.body.classList.remove("sidebar-open");
        });
      }

      var sel = document.getElementById("langSelect");
      sel.value = I18n.current();
      sel.addEventListener("change", function () {
        I18n.setLanguage(sel.value);
        Navbar.render();
      });
      var themeBtn = document.getElementById("themeToggle");
      if (themeBtn) themeBtn.addEventListener("click", function () { Theme.toggle(); Navbar.render(); });
      var logout = document.getElementById("logoutBtn");
      if (logout) {
        logout.addEventListener("click", function () {
          setOpen(false);
          Auth.logout();
          window.location.href = "/home";
        });
      }
      I18n.apply();
    },

    setActive: function (key) {
      document.querySelectorAll("[data-navlink]").forEach(function (a) {
        a.classList.toggle("active", a.textContent === I18n.t(key));
      });
    }
  };
})();
