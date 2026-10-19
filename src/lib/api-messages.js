import { bundledElementLocales, hasNamespace, registerNamespace, translateOnly } from './i18n.js';

/**
 * Backend messages in the CLI's language (haxtheweb/issues#3157).
 *
 * haxcms-nodejs responses keep their English `message` (or `error`) and add a
 * `code` plus `params`. The text for each code lives in the same
 * locales/haxcms-api.<lang>.json files the HAXcms editor uses, bundled with
 * haxcms-nodejs, so the CLI and the browser say the same thing.
 */

const NAMESPACE = 'haxcms-api';
let namespaceReady = false;
let annotate;

function ensureNamespace() {
  if (!namespaceReady) {
    namespaceReady = true;
    if (hasNamespace(NAMESPACE)) {
      return;
    }
    const dir = bundledElementLocales('haxcms-elements');
    if (dir) {
      registerNamespace(NAMESPACE, dir);
    }
  }
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function textOf(holder) {
  if (typeof holder.message === 'string' && holder.message.trim() !== '') {
    return holder.message.trim();
  }
  if (typeof holder.error === 'string' && holder.error.trim() !== '') {
    return holder.error.trim();
  }
  return '';
}

/**
 * @description Find message, code and params in a response body: the body
 * itself, `data` or `__failed`
 * @returns {{code: string, params: object, message: string}}
 */
export function apiMessageParts(body) {
  const found = { code: '', params: {}, message: '' };
  if (typeof body === 'string') {
    found.message = body.trim();
    return found;
  }
  if (!isObject(body)) {
    return found;
  }
  for (const holder of [body, body.data, body.__failed]) {
    if (!isObject(holder)) {
      continue;
    }
    const message = textOf(holder);
    if (!found.code && typeof holder.code === 'string' && holder.code) {
      found.code = holder.code;
      found.params = isObject(holder.params) ? holder.params : {};
      if (message) {
        found.message = message;
      }
    }
    if (!found.message && message) {
      found.message = message;
    }
    if (found.code && found.message) {
      break;
    }
  }
  return found;
}

/**
 * @description Text to show for a backend response: the translation for its
 * code in the CLI's language when there is one, otherwise the English
 * message the server sent, otherwise `fallback`
 * @param body response body (or message string)
 * @param fallback text when there is no message
 */
export function apiMessage(body, fallback = '') {
  const parts = apiMessageParts(body);
  if (parts.code) {
    ensureNamespace();
    const translated = translateOnly(NAMESPACE, parts.code, parts.params);
    if (translated) {
      return translated;
    }
  }
  return parts.message || fallback;
}

/**
 * @description Add `code` / `params` to a body produced by calling a
 * haxcms-nodejs route in-process, the way its HTTP server does. A no-op with
 * a haxcms-nodejs from before message codes.
 * @param resolve injectable require for tests
 */
export function annotateApiBody(body, status, resolve = require) {
  if (annotate === undefined) {
    try {
      annotate = resolve('@haxtheweb/haxcms-nodejs/dist/lib/apiMessageCodes.js').annotateApiResponse;
    } catch (e) {
      annotate = null;
    }
  }
  if (typeof annotate !== 'function') {
    return body;
  }
  try {
    return annotate(body, status);
  } catch (e) {
    return body;
  }
}

// for tests
export function _resetApiMessages() {
  namespaceReady = false;
  annotate = undefined;
}

