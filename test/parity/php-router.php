<?php
// Router for `php -S` mirroring haxcms-php's .ddev/nginx-site.conf (the config
// its e2e suite runs on): existing files are served directly (.php files run
// as themselves), a directory with index.php runs that, and anything else
// falls through to /index.php (try_files $uri $uri/ /index.php?q=$uri&$args).
//
// The script a request maps to is required from the top level of this file,
// never from inside a function: a web server runs index.php in the global
// scope, and a site's index.php relies on that (config.php sets
// $HAXSiteConfig as a plain variable and index.php reads it from $GLOBALS).
// So everything here is a closure or a $__haxRouter* variable, and those are
// unset before the script runs.
if (!isset($_SERVER['HTTP_AUTHORIZATION']) && function_exists('getallheaders')) {
  foreach (getallheaders() as $__haxRouterKey => $__haxRouterValue) {
    if (strtolower($__haxRouterKey) === 'authorization') { $_SERVER['HTTP_AUTHORIZATION'] = $__haxRouterValue; }
  }
  unset($__haxRouterKey, $__haxRouterValue);
}
// [script file, script name] to run, or false to let php -S serve the file
$__haxRouterTarget = (function () {
  $root = rtrim($_SERVER['DOCUMENT_ROOT'], '/');
  $uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
  $file = $root . $uri;
  // system/.htaccess: RewriteCond %{REQUEST_URI} system/api* -> system/api.php
  if (preg_match('#^/system/api#', $uri)) {
    return array($root . '/system/api.php', '/system/api.php');
  }
  // site .htaccess: non-file requests under a site fall to that site's index.php
  if (preg_match('#^/(_?sites)/([^/]+)/#', $uri, $m) && !is_file($file) && is_file($root . '/' . $m[1] . '/' . $m[2] . '/index.php')) {
    return array($root . '/' . $m[1] . '/' . $m[2] . '/index.php', '/' . $m[1] . '/' . $m[2] . '/index.php');
  }
  if ($uri !== '/' && is_file($file)) {
    if (substr($file, -4) === '.php') { return array($file, $uri); }
    return false;
  }
  if (is_dir($file) && is_file(rtrim($file, '/') . '/index.php')) {
    return array(rtrim($file, '/') . '/index.php', rtrim($uri, '/') . '/index.php');
  }
  $_GET['q'] = $uri;
  return array($root . '/index.php', '/index.php');
})();
if ($__haxRouterTarget === false) {
  return false;
}
$_SERVER['SCRIPT_FILENAME'] = $__haxRouterTarget[0];
$_SERVER['SCRIPT_NAME'] = $__haxRouterTarget[1];
$_SERVER['PHP_SELF'] = $__haxRouterTarget[1];
chdir(dirname($__haxRouterTarget[0]));
$__haxRouterScript = $__haxRouterTarget[0];
unset($__haxRouterTarget);
require $__haxRouterScript;
return true;
