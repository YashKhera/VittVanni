(function () {
  "use strict";

  var STYLE_ID = "chat-style";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      ".chat-box{display:flex;flex-direction:column;gap:8px;max-height:320px;overflow-y:auto;" +
      "padding:12px;border:1px solid var(--border,#e5e7eb);border-radius:12px;margin-bottom:12px}" +
      ".chat-msg{max-width:78%;padding:8px 12px;border-radius:14px;font-size:.9rem;animation:chatIn .25s ease}" +
      "@keyframes chatIn{from{transform:translateY(6px);opacity:0}to{transform:none;opacity:1}}" +
      ".chat-msg.mine{align-self:flex-end;background:var(--primary,#2563eb);color:#fff;border-bottom-right-radius:4px}" +
      ".chat-msg.theirs{align-self:flex-start;background:var(--bg-secondary,#f3f4f6);color:var(--text-primary);border-bottom-left-radius:4px}" +
      ".chat-meta{font-size:.72rem;opacity:.75;margin-top:2px}" +
      ".status-pill{display:inline-block;padding:3px 12px;border-radius:999px;font-size:.8rem;font-weight:700}" +
      ".status-submitted{background:#fef3c7;color:#92400e}" +
      ".status-under_review{background:#dbeafe;color:#1e40af}" +
      ".status-approved{background:#dcfce7;color:#166534}" +
      ".status-rejected{background:#fee2e2;color:#991b1b}";
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = css;
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Mount a WhatsApp-like chat for one application. Polls every 5s.
  // opts: { appId, basePath, mount, onEmpty }
  window.Chat = {
    statusPill: function (st) {
      return '<span class="status-pill status-' + esc(st) + '">' + esc(st).replace(/_/g, " ") + "</span>";
    },

    mount: function (opts) {
      injectStyles();
      var box = opts.mount;
      var lastId = 0;
      var timer = null;
      var stopped = false;

      function renderList(list) {
        if (!list.length && !box.hasChildNodes()) {
          box.innerHTML = '<p class="text-muted text-sm">' + I18n.t("chat.empty") + "</p>";
          return;
        }
        if (!list.length) return;
        if (!box.querySelector(".chat-msg")) box.innerHTML = "";
        list.forEach(function (m) {
          lastId = Math.max(lastId, m.id);
          var div = document.createElement("div");
          div.className = "chat-msg " + (m.mine ? "mine" : "theirs");
          div.innerHTML = esc(m.body) +
            '<div class="chat-meta">' + esc(m.sender_role) + "</div>";
          box.appendChild(div);
        });
        box.scrollTop = box.scrollHeight;
      }

      function poll() {
        if (stopped) return;
        API.get(opts.basePath + "/" + opts.appId + "/messages?after_id=" + lastId, Auth.token(), { skipAuthRedirect: true })
          .then(renderList)
          .catch(function () {});
      }

      function send(text) {
        return API.post(opts.basePath + "/" + opts.appId + "/messages", { body: text }, Auth.token())
          .then(function (m) { renderList([m]); });
      }

      poll();
      timer = setInterval(poll, 5000);

      return {
        send: send,
        destroy: function () { stopped = true; if (timer) clearInterval(timer); }
      };
    }
  };
})();
