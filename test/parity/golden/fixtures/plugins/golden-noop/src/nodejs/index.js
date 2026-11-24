// Every hook hands its subject back unchanged (see plugin.yaml and README.md).
const same = (ctx) => ctx.subject;

export default {
  hooks: {
    /**
     * Implements hook entity.before.create.
     *
     * Hands the subject back unchanged.
     */
    "entity.before.create": same,
    /**
     * Implements hook entity.before.read.
     *
     * Hands the subject back unchanged.
     */
    "entity.before.read": same,
    /**
     * Implements hook entity.before.update.
     *
     * Hands the subject back unchanged.
     */
    "entity.before.update": same,
    /**
     * Implements hook entity.before.delete.
     *
     * Hands the subject back unchanged.
     */
    "entity.before.delete": same,
    /**
     * Implements hook entity.after.create.
     *
     * Hands the subject back unchanged.
     */
    "entity.after.create": same,
    /**
     * Implements hook entity.after.read.
     *
     * Hands the subject back unchanged.
     */
    "entity.after.read": same,
    /**
     * Implements hook entity.after.update.
     *
     * Hands the subject back unchanged.
     */
    "entity.after.update": same,
    /**
     * Implements hook entity.after.delete.
     *
     * Hands the subject back unchanged.
     */
    "entity.after.delete": same,
    /**
     * Implements hook page.before.save.
     *
     * Hands the subject back unchanged.
     */
    "page.before.save": same,
    /**
     * Implements hook page.before.delete.
     *
     * Hands the subject back unchanged.
     */
    "page.before.delete": same,
    /**
     * Implements hook page.after.save.
     *
     * Hands the subject back unchanged.
     */
    "page.after.save": same,
    /**
     * Implements hook page.after.delete.
     *
     * Hands the subject back unchanged.
     */
    "page.after.delete": same,
    /**
     * Implements hook file.before.save.
     *
     * Hands the subject back unchanged.
     */
    "file.before.save": same,
    /**
     * Implements hook file.before.delete.
     *
     * Hands the subject back unchanged.
     */
    "file.before.delete": same,
    /**
     * Implements hook file.after.save.
     *
     * Hands the subject back unchanged.
     */
    "file.after.save": same,
    /**
     * Implements hook file.after.delete.
     *
     * Hands the subject back unchanged.
     */
    "file.after.delete": same,
    /**
     * Implements hook manifest.before.save.
     *
     * Hands the subject back unchanged.
     */
    "manifest.before.save": same,
    /**
     * Implements hook theme.before.change.
     *
     * Hands the subject back unchanged.
     */
    "theme.before.change": same,
    /**
     * Implements hook config.before.read.
     *
     * Hands the subject back unchanged.
     */
    "config.before.read": same,
    /**
     * Implements hook config.before.save.
     *
     * Hands the subject back unchanged.
     */
    "config.before.save": same,
    /**
     * Implements hook git.before.commit.
     *
     * Hands the subject back unchanged.
     */
    "git.before.commit": same,
    /**
     * Implements hook transaction.before.start.
     *
     * Hands the subject back unchanged.
     */
    "transaction.before.start": same,
    /**
     * Implements hook transaction.before.end.
     *
     * Hands the subject back unchanged.
     */
    "transaction.before.end": same,
    /**
     * Implements hook rest.before.request.
     *
     * Hands the subject back unchanged.
     */
    "rest.before.request": same,
    /**
     * Implements hook site.before.create.
     *
     * Hands the subject back unchanged.
     */
    "site.before.create": same,
    /**
     * Implements hook site.before.duplicate.
     *
     * Hands the subject back unchanged.
     */
    "site.before.duplicate": same,
    /**
     * Implements hook site.before.archive.
     *
     * Hands the subject back unchanged.
     */
    "site.before.archive": same,
    /**
     * Implements hook site.before.delete.
     *
     * Hands the subject back unchanged.
     */
    "site.before.delete": same,
    /**
     * Implements hook site.before.export.
     *
     * Hands the subject back unchanged.
     */
    "site.before.export": same,
    /**
     * Implements hook user.before.login.
     *
     * Hands the subject back unchanged.
     */
    "user.before.login": same,
    /**
     * Implements hook user.before.logout.
     *
     * Hands the subject back unchanged.
     */
    "user.before.logout": same,
    /**
     * Implements hook manifest.after.save.
     *
     * Hands the subject back unchanged.
     */
    "manifest.after.save": same,
    /**
     * Implements hook theme.after.change.
     *
     * Hands the subject back unchanged.
     */
    "theme.after.change": same,
    /**
     * Implements hook config.after.read.
     *
     * Hands the subject back unchanged.
     */
    "config.after.read": same,
    /**
     * Implements hook config.after.save.
     *
     * Hands the subject back unchanged.
     */
    "config.after.save": same,
    /**
     * Implements hook git.after.commit.
     *
     * Hands the subject back unchanged.
     */
    "git.after.commit": same,
    /**
     * Implements hook transaction.after.start.
     *
     * Hands the subject back unchanged.
     */
    "transaction.after.start": same,
    /**
     * Implements hook transaction.after.end.
     *
     * Hands the subject back unchanged.
     */
    "transaction.after.end": same,
    /**
     * Implements hook rest.after.request.
     *
     * Hands the subject back unchanged.
     */
    "rest.after.request": same,
    /**
     * Implements hook site.after.create.
     *
     * Hands the subject back unchanged.
     */
    "site.after.create": same,
    /**
     * Implements hook site.after.duplicate.
     *
     * Hands the subject back unchanged.
     */
    "site.after.duplicate": same,
    /**
     * Implements hook site.after.archive.
     *
     * Hands the subject back unchanged.
     */
    "site.after.archive": same,
    /**
     * Implements hook site.after.delete.
     *
     * Hands the subject back unchanged.
     */
    "site.after.delete": same,
    /**
     * Implements hook site.after.export.
     *
     * Hands the subject back unchanged.
     */
    "site.after.export": same,
    /**
     * Implements hook user.after.login.
     *
     * Hands the subject back unchanged.
     */
    "user.after.login": same,
    /**
     * Implements hook user.after.logout.
     *
     * Hands the subject back unchanged.
     */
    "user.after.logout": same,
    /**
     * Implements hook render.before.head.
     *
     * Hands the subject back unchanged.
     */
    "render.before.head": same,
    /**
     * Implements hook render.after.head.
     *
     * Hands the subject back unchanged.
     */
    "render.after.head": same,
    /**
     * Implements hook render.before.body.
     *
     * Hands the subject back unchanged.
     */
    "render.before.body": same,
    /**
     * Implements hook render.after.body.
     *
     * Hands the subject back unchanged.
     */
    "render.after.body": same,
    /**
     * Implements hook render.before.content.
     *
     * Hands the subject back unchanged.
     */
    "render.before.content": same,
    /**
     * Implements hook render.after.content.
     *
     * Hands the subject back unchanged.
     */
    "render.after.content": same,
  },
};
