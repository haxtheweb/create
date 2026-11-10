<?php
// Router for `php -S` mirroring haxcms-php's .ddev/nginx-site.conf (the config
// its e2e suite runs on): existing files are served directly (.php files run
// as themselves), a directory with index.php runs that, and anything else
// falls through to /index.php (try_files $uri $uri/ /index.php?q=$uri&$args).
$root = rtrim($_SERVER['DOCUMENT_ROOT'], '/');
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (!isset($_SERVER['HTTP_AUTHORIZATION']) && function_exists('getallheaders')) {
  foreach (getallheaders() as $k => $v) {
    if (strtolower($k) === 'authorization') { $_SERVER['HTTP_AUTHORIZATION'] = $v; }
  }
}
function haxRun($script, $scriptName) {
  $_SERVER['SCRIPT_FILENAME'] = $script;
  $_SERVER['SCRIPT_NAME'] = $scriptName;
  $_SERVER['PHP_SELF'] = $scriptName;
  chdir(dirname($script));
  require $script;
  return true;
}
$file = $root . $uri;
// system/.htaccess: RewriteCond %{REQUEST_URI} system/api* -> system/api.php
if (preg_match('#^/system/api#', $uri)) {
  return haxRun($root . '/system/api.php', '/system/api.php');
}
// site .htaccess: non-file requests under a site fall to that site's index.php
if (preg_match('#^/(_?sites)/([^/]+)/#', $uri, $m) && !is_file($file) && is_file($root . '/' . $m[1] . '/' . $m[2] . '/index.php')) {
  return haxRun($root . '/' . $m[1] . '/' . $m[2] . '/index.php', '/' . $m[1] . '/' . $m[2] . '/index.php');
}
if ($uri !== '/' && is_file($file)) {
  if (substr($file, -4) === '.php') { return haxRun($file, $uri); }
  return false;
}
if (is_dir($file) && is_file(rtrim($file, '/') . '/index.php')) {
  return haxRun(rtrim($file, '/') . '/index.php', rtrim($uri, '/') . '/index.php');
}
$_GET['q'] = $uri;
return haxRun($root . '/index.php', '/index.php');
