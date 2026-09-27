(function () {
  "use strict";
  if (!document.body || document.body.dataset.page !== "register") return;

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
    var email = el("email").value.trim();
    hideError();
    if (!Validation.email(email)) {
      showError(I18n.t("auth.email.invalid"));
      return;
    }
    var btn = el("sendOtpBtn");
    btn.disabled = true;
    btn.textContent = I18n.t("common.loading");
    Auth.requestSignupOtp(email)
      .then(function () {
        showNote(I18n.t("auth.otp.sentSignup"));
        el("otpCode").focus();
        cooldown(btn);
      })
      .catch(function (err) {
        showError(err.message);
        btn.disabled = false;
        btn.textContent = I18n.t("auth.otp.send");
      });
  }

  function submitForm(e) {
    e.preventDefault();
    var email = el("email").value.trim();
    var phone = el("phone").value.trim();
    var code = el("otpCode").value.trim();
    var errorEl = el("formError");
    hideError();

    if (!Validation.email(email)) {
      showError(I18n.t("auth.email.invalid"));
      return;
    }
    if (phone && !Validation.phone(phone)) {
      showError(I18n.t("auth.phone.invalid"));
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      showError(I18n.t("auth.otp.invalid"));
      return;
    }

    var btn = el("registerForm").querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = I18n.t("common.loading");

    Auth.signupWithOtp(email, code, phone)
      .then(function () {
        Notify.success(I18n.t("auth.welcome", { name: email }));
        Auth.routeAfterAuth();
      })
      .catch(function (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove("hidden");
        btn.disabled = false;
        btn.textContent = I18n.t("auth.register.verifySignup");
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = el("registerForm");
    if (!form) return;
    if (Auth.isLoggedIn()) {
      Auth.routeAfterAuth();
      return;
    }
    el("sendOtpBtn").addEventListener("click", sendCode);
    form.addEventListener("submit", submitForm);
    var codeBox = el("otpCode");
    codeBox.addEventListener("input", function () {
      codeBox.value = codeBox.value.replace(/\D/g, "").slice(0, 6);
    });
    var phoneBox = el("phone");
    phoneBox.addEventListener("input", function () {
      phoneBox.value = phoneBox.value.replace(/\D/g, "").slice(0, 10);
    });
  });
})();
