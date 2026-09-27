(function () {
  "use strict";

  var TOKEN_KEY = "token";
  var USER_KEY = "user";

  window.Auth = {
    requestLoginOtp: function (email) {
      var lang = (window.I18n && I18n.current) ? I18n.current() : "en";
      return API.post("/api/auth/otp/request", { email: email, language: lang });
    },
    loginWithOtp: function (email, otp) {
      return API.post("/api/auth/otp/login", { email: email, otp: otp }).then(function (data) {
        if (data && data.access_token) {
          VStore.set(TOKEN_KEY, data.access_token);
        }
        if (data && data.user) {
          VStore.set(USER_KEY, data.user);
        }
        return data;
      });
    },
    requestSignupOtp: function (email, role) {
      var lang = (window.I18n && I18n.current) ? I18n.current() : "en";
      return API.post("/api/auth/otp/request-signup", { email: email, language: lang, role: role || "user" });
    },
    signupWithOtp: function (email, otp, phone, role) {
      return API.post("/api/auth/otp/verify-signup", { email: email, otp: otp, phone_number: phone || "", role: role || "user" }).then(function (data) {
        if (data && data.access_token) {
          VStore.set(TOKEN_KEY, data.access_token);
        }
        if (data && data.user) {
          VStore.set(USER_KEY, data.user);
        }
        return data;
      });
    },
    logout: function () {
      VStore.remove(TOKEN_KEY);
      VStore.remove(USER_KEY);
      if (window.AppStore && AppStore.clearUserData) AppStore.clearUserData();
    },
    token: function () {
      return VStore.get(TOKEN_KEY, null);
    },
    userId: function () {
      var u = this.user();
      return u && u.id;
    },
    me: function () {
      var token = this.token();
      if (!token) return Promise.reject(new Error("Not authenticated"));
      return API.get("/api/auth/me", token).then(function (user) {
        if (user) VStore.set(USER_KEY, user);
        return user;
      });
    },
    user: function () {
      return VStore.get(USER_KEY, null);
    },
    isLoggedIn: function () {
      return !!this.token();
    },
    requireLogin: function (nextPage) {
      if (this.isLoggedIn()) return true;
      var path = nextPage || window.location.pathname || "/";
      window.location.href = "/login?next=" + encodeURIComponent(path + window.location.search);
      return false;
    },
    routeAfterAuth: function () {
      function dest(clean) {
        return clean; // all routes are root-relative clean URLs
      }
      if (!this.isLoggedIn()) {
        var path = window.location.pathname || "/";
        window.location.href = "/login?next=" + encodeURIComponent(path + window.location.search);
        return;
      }
      // Partners land on their own dashboard, never the user flow.
      var me = this.user();
      if (me && me.role === "partner") {
        window.location.href = dest("/partner");
        return;
      }
      API.get("/api/profile", this.token(), { skipAuthRedirect: true })
        .then(function (profile) {
          if (profile && profile.ai_confirmed) {
            window.location.href = dest("/my-schemes");
          } else if (profile) {
            window.location.href = dest("/find-schemes");
          } else {
            window.location.href = dest("/profile/edit");
          }
        })
        .catch(function (err) {
          if (err && err.status === 404) {
            window.location.href = dest("/profile/edit");
          } else {
            window.location.href = dest("/my-schemes");
          }
        });
    },
    updateUser: function (user) {
      VStore.set(USER_KEY, user);
    }
  };
})();