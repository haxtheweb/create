<?php
// Drives one historical haxcms-php checkout to create a fixture site, using
// that version's own Operations class (the same methods its API called):
// createSite, then createNode + saveNode for every page in the spec.
//
//   php drive.php <core root> <spec.json>
//
// <core root> is a throwaway copy of that year's haxcms-php tree (at least
// system/backend/php, system/boilerplate and system/coreConfig). This script
// installs it the way install.php did (_config from
// system/boilerplate/systemsetup, an empty _sites), then runs the ops in CLI
// mode, where that code skips JWT / token checks. The site is written to
// <core root>/_sites/<name>. Prints one JSON line: {"ok":true,...} or
// {"ok":false,"error":...}. Called by generate.cjs; nothing here is
// machine-specific.

$coreRoot = realpath($argv[1]);
$spec = json_decode(file_get_contents($argv[2]), true);
if (!$coreRoot || !is_array($spec)) {
  fwrite(STDERR, "usage: php drive.php <core root> <spec.json>\n");
  exit(2);
}

function fail($msg) {
  print json_encode(array('ok' => false, 'error' => $msg)) . "\n";
  exit(1);
}

function recurseCopyDir($src, $dst) {
  @mkdir($dst, 0777, true);
  foreach (scandir($src) as $f) {
    if ($f === '.' || $f === '..') {
      continue;
    }
    if (is_dir("$src/$f")) {
      recurseCopyDir("$src/$f", "$dst/$f");
    }
    else {
      copy("$src/$f", "$dst/$f");
    }
  }
}

// install: what install.php / scripts/haxtheweb.sh did for a fresh core
if (!is_dir("$coreRoot/_config")) {
  recurseCopyDir("$coreRoot/system/boilerplate/systemsetup", "$coreRoot/_config");
  @mkdir("$coreRoot/_config/cache", 0777, true);
  file_put_contents("$coreRoot/_config/SALT.txt", 'old-site-fixture-salt');
}
@mkdir("$coreRoot/_sites", 0777, true);
@mkdir("$coreRoot/_archived", 0777, true);
@mkdir("$coreRoot/_published", 0777, true);

// HAXCMS's constructor shifts three CLI args off argv and reads --op etc.
$GLOBALS['argv'] = array('api.php', '--op=createSite', '--', '--op=createSite');
$_SERVER['argv'] = $GLOBALS['argv'];
$_SERVER['argc'] = count($GLOBALS['argv']);
unset($_SERVER['SERVER_SOFTWARE']);

// silence deprecations from old code on a newer PHP; real errors still throw
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED & ~E_NOTICE & ~E_WARNING);
ob_start();
include_once "$coreRoot/system/backend/php/bootstrapHAX.php";
if (file_exists($HAXCMS->configDirectory . '/config.php')) {
  include_once $HAXCMS->configDirectory . '/config.php';
}
include_once "$coreRoot/system/backend/php/lib/Operations.php";
ob_end_clean();

function runOp($op, $params) {
  $ops = new Operations();
  $ops->params = $params;
  $ops->rawParams = $params;
  ob_start();
  try {
    $res = $ops->{$op}();
  }
  catch (Throwable $e) {
    ob_end_clean();
    fail("$op threw: " . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
  }
  ob_end_clean();
  if (is_array($res) && isset($res['__failed'])) {
    fail("$op failed: " . json_encode($res['__failed']));
  }
  return $res;
}

// the item a createNode returned: a bare item (old) or {status, data} (newer)
function itemOf($res) {
  if (is_array($res) && isset($res['data'])) {
    return $res['data'];
  }
  return $res;
}

$siteName = $spec['name'];
runOp('createSite', array(
  'site' => array(
    'name' => $siteName,
    'description' => $spec['description'],
    'theme' => $spec['theme'],
  ),
  'theme' => array(
    'icon' => 'icons:book',
    'hexCode' => '#3f51b5',
  ),
  'site_token' => '',
  'user_token' => '',
));
$site = $HAXCMS->loadSite($siteName);
if (!$site) {
  fail('createSite did not create ' . $siteName);
}
$machineName = $site->manifest->metadata->site->name;

// pages in spec order; parent refers to an earlier page's key
$ids = array();
// new pages go after what createSite already made (the welcome page)
$orders = array();
foreach ($site->manifest->items as $existing) {
  $existing = (object) $existing;
  $pkey = empty($existing->parent) ? '' : $existing->parent;
  $o = isset($existing->order) ? intval($existing->order) : 0;
  if (!isset($orders[$pkey]) || $orders[$pkey] < $o) {
    $orders[$pkey] = $o;
  }
}
foreach ($spec['pages'] as $page) {
  $parentId = null;
  $indent = 0;
  if (!empty($page['parent'])) {
    $parentId = $ids[$page['parent']];
    $indent = 1;
  }
  $pkey = $parentId === null ? '' : $parentId;
  $order = isset($orders[$pkey]) ? $orders[$pkey] + 1 : 0;
  $orders[$pkey] = $order;
  $params = array(
    'site' => array('name' => $machineName),
    'node' => array('title' => $page['title']),
    'indent' => $indent,
    'order' => $order,
    'site_token' => '',
    'user_token' => '',
  );
  if ($parentId !== null) {
    $params['parent'] = $parentId;
  }
  $item = itemOf(runOp('createNode', $params));
  $item = (object) $item;
  $ids[$page['key']] = $item->id;
  // save the body the way the editor did: html plus a light schema of tags
  $schema = array();
  if (preg_match_all('/<([a-z][a-z0-9-]*)[\s>]/', $page['body'], $m)) {
    foreach ($m[1] as $tag) {
      $schema[] = array('tag' => $tag, 'properties' => array(), 'content' => '');
    }
  }
  $body = $page['body'];
  // from 2022 on the editor sent a <page-break> describing the page ahead of
  // the body, and saveNode parses it (pageBreakParser); match that era
  if (method_exists($HAXCMS, 'pageBreakParser')) {
    $site = $HAXCMS->loadSite($machineName);
    $cur = (object) $site->loadNode($item->id);
    $attrs = array(
      'item-id' => $cur->id,
      'title' => $cur->title,
      'path' => $cur->slug,
      'slug' => $cur->slug,
      'order' => isset($cur->order) ? $cur->order : 0,
      'depth' => isset($cur->indent) ? $cur->indent : 0,
    );
    if (!empty($cur->parent)) {
      $attrs['parent'] = $cur->parent;
    }
    $pb = '<page-break';
    foreach ($attrs as $k => $v) {
      $pb .= ' ' . $k . '="' . htmlspecialchars((string) $v, ENT_QUOTES) . '"';
    }
    $body = $pb . ' published="published"></page-break>' . $body;
  }
  runOp('saveNode', array(
    'site' => array('name' => $machineName),
    'node' => array(
      'id' => $item->id,
      'body' => $body,
      'schema' => $schema,
    ),
    'site_token' => '',
    'user_token' => '',
  ));
}

print json_encode(array(
  'ok' => true,
  'siteDir' => "$coreRoot/_sites/$machineName",
  'ids' => $ids,
)) . "\n";
