(function () {
  "use strict";
  if (!document.body || document.body.dataset.page !== "login") return;

  var RESEND_SECONDS = 60;

  function el(id) { return document.getElementById(id); }

  function showError(msg) {
    var errorEl = el("formError");
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
    el("formNote").classList.add("hidden");
  }
  function hideError() { el("formError").classList.add("hidden"); }
  function showNote(msg) {
    var noteEl = el("formNote");
    noteEl.textContent = msg;
    noteEl.classList.remove("hidden");
    el("formError").classList.add("hidden");
  }

  function otpEmail() {
    return el("otpEmail") ? el("otpEmail").value.trim() : "";
  }

  function afterAuth(email) {
    Notify.success(I18n.t("auth.welcome", { name: (Auth.user() && Auth.user().name) || email }));
    Auth.routeAfterAuth();
  }

  var resendTimer = null;
  function cooldown(btn) {
    var left = RESEND_SECONDS;
    btn.disabled = true;
    clearInterval(resendTimer);
    resendTimer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(resendTimer);
        btn.disabled = false;
        btn.textContent = I18n.t("auth.otp.send");
      } else {
        btn.textContent = I18n.t("auth.otp.resendIn", { s: left });
      }
    }, 1000);
  }

  function sendCode() {
    var email = otpEmail();
    hideError();
    if (!Validation.email(email)) {
      showError(I18n.t("auth.email.invalid"));
      return;
    }
    var btn = el("sendOtpBtn");
    btn.disabled = true;
    btn.textContent = I18n.t("common.loading");
    Auth.requestLoginOtp(email)
      .then(function () {
        showNote(I18n.t("auth.otp.sentLogin"));
        el("otpCode").focus();
        cooldown(btn);
      })
      .catch(function (err) {
        showError(err.message);
        btn.disabled = false;
        btn.textContent = I18n.t("auth.otp.send");
      });
  }

  function verifyCode(e) {
    e.preventDefault();
    var email = otpEmail();
    var code = el("otpCode").value.trim();
    hideError();
    if (!Validation.email(email)) {
      showError(I18n.t("auth.email.invalid"));
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      showError(I18n.t("auth.otp.invalid"));
      return;
    }
    var btn = el("otpForm").querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = I18n.t("common.loading");
    Auth.loginWithOtp(email, code)
      .then(function () { afterAuth(email); })
      .catch(function (err) {
        showError(err.message);
        btn.disabled = false;
        btn.textContent = I18n.t("auth.otp.verifyLogin");
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = el("otpForm");
    if (!form) return;
    if (Auth.isLoggedIn()) {
      Auth.routeAfterAuth();
      return;
    }
    el("sendOtpBtn").addEventListener("click", sendCode);
    form.addEventListener("submit", verifyCode);
    var codeBox = el("otpCode");
    codeBox.addEventListener("input", function () {
      codeBox.value = codeBox.value.replace(/\D/g, "").slice(0, 6);
    });
  });
})();
