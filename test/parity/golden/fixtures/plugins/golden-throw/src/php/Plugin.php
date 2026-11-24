<?php
// Every hook throws (mirrors src/nodejs/index.js).
class GoldenThrowPlugin {
  /**
   * Implements hook entity.before.create.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function entityBeforeCreate($ctx) {
    throw new RuntimeException('golden-throw: entityBeforeCreate');
  }

  /**
   * Implements hook entity.before.read.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function entityBeforeRead($ctx) {
    throw new RuntimeException('golden-throw: entityBeforeRead');
  }

  /**
   * Implements hook entity.before.update.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function entityBeforeUpdate($ctx) {
    throw new RuntimeException('golden-throw: entityBeforeUpdate');
  }

  /**
   * Implements hook entity.before.delete.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function entityBeforeDelete($ctx) {
    throw new RuntimeException('golden-throw: entityBeforeDelete');
  }

  /**
   * Implements hook entity.after.create.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function entityAfterCreate($ctx) {
    throw new RuntimeException('golden-throw: entityAfterCreate');
  }

  /**
   * Implements hook entity.after.read.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function entityAfterRead($ctx) {
    throw new RuntimeException('golden-throw: entityAfterRead');
  }

  /**
   * Implements hook entity.after.update.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function entityAfterUpdate($ctx) {
    throw new RuntimeException('golden-throw: entityAfterUpdate');
  }

  /**
   * Implements hook entity.after.delete.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function entityAfterDelete($ctx) {
    throw new RuntimeException('golden-throw: entityAfterDelete');
  }

  /**
   * Implements hook page.before.save.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function pageBeforeSave($ctx) {
    throw new RuntimeException('golden-throw: pageBeforeSave');
  }

  /**
   * Implements hook page.before.delete.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function pageBeforeDelete($ctx) {
    throw new RuntimeException('golden-throw: pageBeforeDelete');
  }

  /**
   * Implements hook page.after.save.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function pageAfterSave($ctx) {
    throw new RuntimeException('golden-throw: pageAfterSave');
  }

  /**
   * Implements hook page.after.delete.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function pageAfterDelete($ctx) {
    throw new RuntimeException('golden-throw: pageAfterDelete');
  }

  /**
   * Implements hook file.before.save.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function fileBeforeSave($ctx) {
    throw new RuntimeException('golden-throw: fileBeforeSave');
  }

  /**
   * Implements hook file.before.delete.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function fileBeforeDelete($ctx) {
    throw new RuntimeException('golden-throw: fileBeforeDelete');
  }

  /**
   * Implements hook file.after.save.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function fileAfterSave($ctx) {
    throw new RuntimeException('golden-throw: fileAfterSave');
  }

  /**
   * Implements hook file.after.delete.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function fileAfterDelete($ctx) {
    throw new RuntimeException('golden-throw: fileAfterDelete');
  }

  /**
   * Implements hook manifest.before.save.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function manifestBeforeSave($ctx) {
    throw new RuntimeException('golden-throw: manifestBeforeSave');
  }

  /**
   * Implements hook theme.before.change.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function themeBeforeChange($ctx) {
    throw new RuntimeException('golden-throw: themeBeforeChange');
  }

  /**
   * Implements hook config.before.read.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function configBeforeRead($ctx) {
    throw new RuntimeException('golden-throw: configBeforeRead');
  }

  /**
   * Implements hook config.before.save.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function configBeforeSave($ctx) {
    throw new RuntimeException('golden-throw: configBeforeSave');
  }

  /**
   * Implements hook git.before.commit.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function gitBeforeCommit($ctx) {
    throw new RuntimeException('golden-throw: gitBeforeCommit');
  }

  /**
   * Implements hook transaction.before.start.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function transactionBeforeStart($ctx) {
    throw new RuntimeException('golden-throw: transactionBeforeStart');
  }

  /**
   * Implements hook transaction.before.end.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function transactionBeforeEnd($ctx) {
    throw new RuntimeException('golden-throw: transactionBeforeEnd');
  }

  /**
   * Implements hook rest.before.request.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function restBeforeRequest($ctx) {
    throw new RuntimeException('golden-throw: restBeforeRequest');
  }

  /**
   * Implements hook site.before.create.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function siteBeforeCreate($ctx) {
    throw new RuntimeException('golden-throw: siteBeforeCreate');
  }

  /**
   * Implements hook site.before.duplicate.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function siteBeforeDuplicate($ctx) {
    throw new RuntimeException('golden-throw: siteBeforeDuplicate');
  }

  /**
   * Implements hook site.before.archive.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function siteBeforeArchive($ctx) {
    throw new RuntimeException('golden-throw: siteBeforeArchive');
  }

  /**
   * Implements hook site.before.delete.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function siteBeforeDelete($ctx) {
    throw new RuntimeException('golden-throw: siteBeforeDelete');
  }

  /**
   * Implements hook site.before.export.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function siteBeforeExport($ctx) {
    throw new RuntimeException('golden-throw: siteBeforeExport');
  }

  /**
   * Implements hook user.before.login.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function userBeforeLogin($ctx) {
    throw new RuntimeException('golden-throw: userBeforeLogin');
  }

  /**
   * Implements hook user.before.logout.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function userBeforeLogout($ctx) {
    throw new RuntimeException('golden-throw: userBeforeLogout');
  }

  /**
   * Implements hook manifest.after.save.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function manifestAfterSave($ctx) {
    throw new RuntimeException('golden-throw: manifestAfterSave');
  }

  /**
   * Implements hook theme.after.change.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function themeAfterChange($ctx) {
    throw new RuntimeException('golden-throw: themeAfterChange');
  }

  /**
   * Implements hook config.after.read.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function configAfterRead($ctx) {
    throw new RuntimeException('golden-throw: configAfterRead');
  }

  /**
   * Implements hook config.after.save.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function configAfterSave($ctx) {
    throw new RuntimeException('golden-throw: configAfterSave');
  }

  /**
   * Implements hook git.after.commit.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function gitAfterCommit($ctx) {
    throw new RuntimeException('golden-throw: gitAfterCommit');
  }

  /**
   * Implements hook transaction.after.start.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function transactionAfterStart($ctx) {
    throw new RuntimeException('golden-throw: transactionAfterStart');
  }

  /**
   * Implements hook transaction.after.end.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function transactionAfterEnd($ctx) {
    throw new RuntimeException('golden-throw: transactionAfterEnd');
  }

  /**
   * Implements hook rest.after.request.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function restAfterRequest($ctx) {
    throw new RuntimeException('golden-throw: restAfterRequest');
  }

  /**
   * Implements hook site.after.create.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function siteAfterCreate($ctx) {
    throw new RuntimeException('golden-throw: siteAfterCreate');
  }

  /**
   * Implements hook site.after.duplicate.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function siteAfterDuplicate($ctx) {
    throw new RuntimeException('golden-throw: siteAfterDuplicate');
  }

  /**
   * Implements hook site.after.archive.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function siteAfterArchive($ctx) {
    throw new RuntimeException('golden-throw: siteAfterArchive');
  }

  /**
   * Implements hook site.after.delete.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function siteAfterDelete($ctx) {
    throw new RuntimeException('golden-throw: siteAfterDelete');
  }

  /**
   * Implements hook site.after.export.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function siteAfterExport($ctx) {
    throw new RuntimeException('golden-throw: siteAfterExport');
  }

  /**
   * Implements hook user.after.login.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function userAfterLogin($ctx) {
    throw new RuntimeException('golden-throw: userAfterLogin');
  }

  /**
   * Implements hook user.after.logout.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function userAfterLogout($ctx) {
    throw new RuntimeException('golden-throw: userAfterLogout');
  }

  /**
   * Implements hook render.before.head.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function renderBeforeHead($ctx) {
    throw new RuntimeException('golden-throw: renderBeforeHead');
  }

  /**
   * Implements hook render.after.head.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function renderAfterHead($ctx) {
    throw new RuntimeException('golden-throw: renderAfterHead');
  }

  /**
   * Implements hook render.before.body.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function renderBeforeBody($ctx) {
    throw new RuntimeException('golden-throw: renderBeforeBody');
  }

  /**
   * Implements hook render.after.body.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function renderAfterBody($ctx) {
    throw new RuntimeException('golden-throw: renderAfterBody');
  }

  /**
   * Implements hook render.before.content.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function renderBeforeContent($ctx) {
    throw new RuntimeException('golden-throw: renderBeforeContent');
  }

  /**
   * Implements hook render.after.content.
   *
   * Throws, so the platform has to carry on without it.
   */
  public function renderAfterContent($ctx) {
    throw new RuntimeException('golden-throw: renderAfterContent');
  }
}
