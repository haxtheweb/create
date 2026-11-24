<?php
// Every hook hands its subject back unchanged (mirrors src/nodejs/index.js).
class GoldenNoopPlugin {
  /**
   * Implements hook entity.before.create.
   *
   * Hands the subject back unchanged.
   */
  public function entityBeforeCreate($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook entity.before.read.
   *
   * Hands the subject back unchanged.
   */
  public function entityBeforeRead($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook entity.before.update.
   *
   * Hands the subject back unchanged.
   */
  public function entityBeforeUpdate($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook entity.before.delete.
   *
   * Hands the subject back unchanged.
   */
  public function entityBeforeDelete($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook entity.after.create.
   *
   * Hands the subject back unchanged.
   */
  public function entityAfterCreate($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook entity.after.read.
   *
   * Hands the subject back unchanged.
   */
  public function entityAfterRead($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook entity.after.update.
   *
   * Hands the subject back unchanged.
   */
  public function entityAfterUpdate($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook entity.after.delete.
   *
   * Hands the subject back unchanged.
   */
  public function entityAfterDelete($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook page.before.save.
   *
   * Hands the subject back unchanged.
   */
  public function pageBeforeSave($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook page.before.delete.
   *
   * Hands the subject back unchanged.
   */
  public function pageBeforeDelete($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook page.after.save.
   *
   * Hands the subject back unchanged.
   */
  public function pageAfterSave($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook page.after.delete.
   *
   * Hands the subject back unchanged.
   */
  public function pageAfterDelete($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook file.before.save.
   *
   * Hands the subject back unchanged.
   */
  public function fileBeforeSave($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook file.before.delete.
   *
   * Hands the subject back unchanged.
   */
  public function fileBeforeDelete($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook file.after.save.
   *
   * Hands the subject back unchanged.
   */
  public function fileAfterSave($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook file.after.delete.
   *
   * Hands the subject back unchanged.
   */
  public function fileAfterDelete($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook manifest.before.save.
   *
   * Hands the subject back unchanged.
   */
  public function manifestBeforeSave($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook theme.before.change.
   *
   * Hands the subject back unchanged.
   */
  public function themeBeforeChange($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook config.before.read.
   *
   * Hands the subject back unchanged.
   */
  public function configBeforeRead($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook config.before.save.
   *
   * Hands the subject back unchanged.
   */
  public function configBeforeSave($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook git.before.commit.
   *
   * Hands the subject back unchanged.
   */
  public function gitBeforeCommit($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook transaction.before.start.
   *
   * Hands the subject back unchanged.
   */
  public function transactionBeforeStart($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook transaction.before.end.
   *
   * Hands the subject back unchanged.
   */
  public function transactionBeforeEnd($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook rest.before.request.
   *
   * Hands the subject back unchanged.
   */
  public function restBeforeRequest($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook site.before.create.
   *
   * Hands the subject back unchanged.
   */
  public function siteBeforeCreate($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook site.before.duplicate.
   *
   * Hands the subject back unchanged.
   */
  public function siteBeforeDuplicate($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook site.before.archive.
   *
   * Hands the subject back unchanged.
   */
  public function siteBeforeArchive($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook site.before.delete.
   *
   * Hands the subject back unchanged.
   */
  public function siteBeforeDelete($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook site.before.export.
   *
   * Hands the subject back unchanged.
   */
  public function siteBeforeExport($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook user.before.login.
   *
   * Hands the subject back unchanged.
   */
  public function userBeforeLogin($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook user.before.logout.
   *
   * Hands the subject back unchanged.
   */
  public function userBeforeLogout($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook manifest.after.save.
   *
   * Hands the subject back unchanged.
   */
  public function manifestAfterSave($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook theme.after.change.
   *
   * Hands the subject back unchanged.
   */
  public function themeAfterChange($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook config.after.read.
   *
   * Hands the subject back unchanged.
   */
  public function configAfterRead($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook config.after.save.
   *
   * Hands the subject back unchanged.
   */
  public function configAfterSave($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook git.after.commit.
   *
   * Hands the subject back unchanged.
   */
  public function gitAfterCommit($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook transaction.after.start.
   *
   * Hands the subject back unchanged.
   */
  public function transactionAfterStart($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook transaction.after.end.
   *
   * Hands the subject back unchanged.
   */
  public function transactionAfterEnd($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook rest.after.request.
   *
   * Hands the subject back unchanged.
   */
  public function restAfterRequest($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook site.after.create.
   *
   * Hands the subject back unchanged.
   */
  public function siteAfterCreate($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook site.after.duplicate.
   *
   * Hands the subject back unchanged.
   */
  public function siteAfterDuplicate($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook site.after.archive.
   *
   * Hands the subject back unchanged.
   */
  public function siteAfterArchive($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook site.after.delete.
   *
   * Hands the subject back unchanged.
   */
  public function siteAfterDelete($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook site.after.export.
   *
   * Hands the subject back unchanged.
   */
  public function siteAfterExport($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook user.after.login.
   *
   * Hands the subject back unchanged.
   */
  public function userAfterLogin($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook user.after.logout.
   *
   * Hands the subject back unchanged.
   */
  public function userAfterLogout($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook render.before.head.
   *
   * Hands the subject back unchanged.
   */
  public function renderBeforeHead($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook render.after.head.
   *
   * Hands the subject back unchanged.
   */
  public function renderAfterHead($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook render.before.body.
   *
   * Hands the subject back unchanged.
   */
  public function renderBeforeBody($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook render.after.body.
   *
   * Hands the subject back unchanged.
   */
  public function renderAfterBody($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook render.before.content.
   *
   * Hands the subject back unchanged.
   */
  public function renderBeforeContent($ctx) {
    return $ctx->subject;
  }

  /**
   * Implements hook render.after.content.
   *
   * Hands the subject back unchanged.
   */
  public function renderAfterContent($ctx) {
    return $ctx->subject;
  }
}
