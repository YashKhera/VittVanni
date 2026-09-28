(function () {
  "use strict";
  if (!document.body || document.body.dataset.page !== "landing") return;

  var FALLBACK = { schemes: 90, partners: 0 };

  function fillStates() {
    var el = document.querySelectorAll("main [data-i18n]");
    el.forEach(function (node) {
      if (node.getAttribute("data-i18n").indexOf("landing.") === 0) node.textContent = I18n.t(node.getAttribute("data-i18n"));
    });
  }

  function countUp(numEl, target, suffix) {
    var start = null;
    var dur = 1400;
    function frame(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      numEl.textContent = Math.round(target * eased) + (suffix || "");
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function renderStats(counts) {
    var stats = [
      { n: counts.schemes, suffix: "+", key: "landing.stats.schemes" },
      { n: 14, suffix: "", key: "landing.stats.sectors" },
      { n: 29, suffix: "", key: "landing.stats.states" },
      { n: 23, suffix: "", key: "landing.stats.languages" }
    ];
    if (counts.partners > 0) {
      stats.push({ n: counts.partners, suffix: "+", key: "landing.stats.partners" });
    }
    var grid = document.querySelectorAll("[data-stat-grid]");
    grid.forEach(function (g) {
      g.innerHTML = stats.map(function (s) {
        return '<div class="stat-item fade-in-up" data-count="' + s.n + '" data-suffix="' + s.suffix + '">' +
          '<div class="stat-number">0' + s.suffix + '</div><div class="stat-label">' + I18n.t(s.key) + "</div></div>";
      }).join("");
      var items = g.querySelectorAll(".stat-item");
      var seen = function (item) {
        var target = parseInt(item.getAttribute("data-count"), 10) || 0;
        var suffix = item.getAttribute("data-suffix") || "";
        countUp(item.querySelector(".stat-number"), target, suffix);
      };
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) { seen(en.target); io.unobserve(en.target); }
          });
        }, { threshold: 0.4 });
        items.forEach(function (item) { io.observe(item); });
      } else {
        items.forEach(seen);
      }
      items.forEach(function (item) {
        item.addEventListener("mouseenter", function () {
          var target = parseInt(item.getAttribute("data-count"), 10) || 0;
          countUp(item.querySelector(".stat-number"), target, item.getAttribute("data-suffix") || "");
        });
      });
    });
  }

  function watchChalkboard() {
    var board = document.querySelector("[data-chalkboard]");
    if (!board) return;
    var started = false;
    var resetTimer = null;
    var restart = function () {
      // Cancel any pending exit-reset so a quick revisit never resumes
      // a half-faded state.
      if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
      board.classList.remove("drawn");
      // Two-step restart: let the removal paint first, then play from 0.
      // Without the frame gap, an instant revisit glues onto mid-flight
      // transitions and the sequence looks broken.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          board.classList.add("drawn");
          started = true;
        });
      });
    };
    var inView = function () {
      var r = board.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    };
    // Start instantly if the section is already on screen at load.
    if (inView()) restart();
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          // Every entry restarts from 0; exits reset only after a short
          // settle delay so flicking past the section can't corrupt a play.
          if (en.isIntersecting) restart();
          else if (!resetTimer) {
            resetTimer = setTimeout(function () {
              resetTimer = null;
              board.classList.remove("drawn");
            }, 600);
          }
        });
      }, { threshold: 0.05 });
      io.observe(board);
    }
    // Safety net: never leave the board blank — first draw within ~1s.
    setTimeout(function () { if (!started) restart(); }, 1200);
  }

  function cursorGlow() {
    var hero = document.querySelector(".hero");
    var glow = document.querySelector("[data-hero-glow]");
    if (!hero || !glow) return;
    hero.addEventListener("mousemove", function (e) {
      var r = hero.getBoundingClientRect();
      glow.style.left = (e.clientX - r.left) + "px";
      glow.style.top = (e.clientY - r.top) + "px";
      glow.style.opacity = "1";
    });
    hero.addEventListener("mouseleave", function () { glow.style.opacity = "0"; });
  }

  function loadCounts() {
    fetch("/api/schemes/stats").then(function (r) {
      return r.ok ? r.json() : FALLBACK;
    }).then(function (d) {
      renderStats({
        schemes: (d && d.schemes) || FALLBACK.schemes,
        partners: (d && d.partners) || 0
      });
    }).catch(function () {
      renderStats({ schemes: FALLBACK.schemes, partners: 0 });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    fillStates();
    loadCounts();
    watchChalkboard();
    cursorGlow();
  });

  window.addEventListener("languagechange", function () {
    fillStates();
    loadCounts();
  });
})();
