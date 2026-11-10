// Minimal HAXcms API client usable against haxcms-nodejs and haxcms-php.
// Follows the same auth flow as haxcms-nodejs's API conformance suite:
// login -> JWT, connection-settings -> user token, site connection-settings
// -> site token + siteApiBasePath.
const vm = require("node:vm");

function parseSettings(src) {
  const sandbox = { window: {} };
  vm.runInNewContext(String(src || ""), sandbox, { timeout: 1000 });
  return sandbox.window.appSettings || {};
}

class HaxClient {
  constructor(baseUrl, username, password, label) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.username = username;
    this.password = password;
    this.label = label;
  }

  async raw(method, url, { headers = {}, body, text = false } = {}) {
    const res = await fetch(url.startsWith("http") ? url : this.baseUrl + url, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
      redirect: "manual",
    });
    const bodyText = await res.text();
    let json = null;
    if (!text) {
      try {
        json = JSON.parse(bodyText);
      } catch (e) {
        json = null;
      }
    }
    return { status: res.status, bodyText, json };
  }

  async login() {
    const r = await this.raw("POST", "/system/api/v1/session/login", {
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: { username: this.username, password: this.password },
    });
    if (!r.json || !r.json.jwt)
      throw new Error(
        `${this.label} login failed ${r.status}: ${r.bodyText.slice(0, 300)}`,
      );
    this.jwt = r.json.jwt;
    const s = await this.settings("");
    this.userToken = s.userToken;
    this.userTokenHeader = s.userTokenHeader || "X-HAXCMS-User-Token";
    this.dashboard = s;
    return this;
  }

  async settings(refererPath) {
    const headers = {
      accept: "application/javascript",
      authorization: "Bearer " + this.jwt,
    };
    if (refererPath) headers.referer = this.baseUrl + refererPath;
    const r = await this.raw(
      "GET",
      "/system/api/v1/session/connection-settings",
      { headers, text: true },
    );
    if (r.status !== 200)
      throw new Error(`${this.label} connection-settings ${r.status}`);
    return parseSettings(r.bodyText);
  }

  systemHeaders() {
    const h = {
      "content-type": "application/json",
      accept: "application/json",
      authorization: "Bearer " + this.jwt,
    };
    h[this.userTokenHeader] = this.userToken;
    return h;
  }

  async createSite(name, description, theme) {
    const site = { name, description };
    if (theme) site.theme = theme;
    const r = await this.raw("POST", "/system/api/v1/sites", {
      headers: Object.assign(
        this.systemHeaders(),
        this.dashboard.createSiteHeaders || {},
      ),
      body: { jwt: this.jwt, token: this.dashboard.token, site },
    });
    if (r.status !== 200)
      throw new Error(
        `${this.label} createSite ${r.status}: ${r.bodyText.slice(0, 400)}`,
      );
    return r.json;
  }

  async openSite(name) {
    const s = await this.settings(`/_sites/${name}/`);
    this.siteToken = s.siteToken;
    this.siteApiBasePath = (
      s.siteApiBasePath || `/_sites/${name}/x/api`
    ).replace(/\/+$/, "");
    return s;
  }

  siteHeaders() {
    const h = this.systemHeaders();
    h["X-HAXCMS-Site-Token"] = this.siteToken;
    return h;
  }

  async site(method, specPath, body) {
    // specPath is relative to /x/api, e.g. '/v1/items'
    return this.raw(method, this.siteApiBasePath + specPath, {
      headers: this.siteHeaders(),
      body,
    });
  }
}

module.exports = { HaxClient };
