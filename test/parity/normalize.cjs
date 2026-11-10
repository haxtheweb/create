// Accepted differences. Each entry is a difference that comes from how a
// backend is deployed or which HTML parser it uses, not from what it does with
// the operation, so it is normalized away before snapshots are compared.
// Everything not listed here is compared strictly. Adding an entry hides a
// class of difference from every future run, so keep each one as narrow as
// possible (one path, explicit values) and say why it is accepted.
const { MALFORMED_HTML } = require("./ops.cjs");

// Every form a supported parser repairs MALFORMED_HTML into. A new form shows
// up as a divergence until it is reviewed and added here.
const HTML_REPAIRS = [
  {
    input: MALFORMED_HTML,
    token: "<!-- parity:html-repair:unclosed-nesting -->",
    renditions: [
      MALFORMED_HTML,
      // haxcms-nodejs and the CLI (node-html-parser)
      "<div><p>Unclosed paragraph</p><div>bad nesting<p></p></div></div>",
      // haxcms-php (DOMDocument / libxml)
      "<div><p>Unclosed paragraph</p><div>bad nesting</div></div>",
    ],
  },
];

const SITES_PREFIXES = ["/_sites/", "/sites/"];

const ACCEPTED = [
  {
    id: "site-location",
    path: "site.json.location",
    why: "haxcms-nodejs serves sites from /_sites/, haxcms-php from /sites/ (a deployment path set by the server, not by the operation).",
    apply(snap) {
      const m = snap.manifest;
      if (!m || typeof m.location !== "string") return false;
      for (const prefix of SITES_PREFIXES) {
        if (m.location.startsWith(prefix)) {
          m.location = "<sites>/" + m.location.slice(prefix.length);
          return true;
        }
      }
      return false;
    },
  },
  {
    id: "html-repair",
    path: "pages.<item>",
    why: "Malformed markup the harness sends on purpose is repaired differently by each backend's HTML parser; only the listed repaired forms are accepted.",
    apply(snap) {
      let hit = false;
      for (const key of Object.keys(snap.pages || {})) {
        let html = snap.pages[key];
        if (typeof html !== "string") continue;
        for (const repair of HTML_REPAIRS) {
          // longest first so a rendition that contains another wins
          const forms = repair.renditions
            .slice()
            .sort((a, b) => b.length - a.length);
          for (const form of forms) {
            if (html.indexOf(form) !== -1) {
              html = html.split(form).join(repair.token);
              hit = true;
            }
          }
        }
        snap.pages[key] = html;
      }
      return hit;
    },
  },
];

// Mutates snap; returns the ids of the normalizations that changed something.
function applyAccepted(snap) {
  const applied = [];
  for (const rule of ACCEPTED) if (rule.apply(snap)) applied.push(rule.id);
  return applied;
}

module.exports = { ACCEPTED, HTML_REPAIRS, applyAccepted };
