// Every hook throws (see plugin.yaml and README.md): a hook error is logged and
// the operation goes on as if the hook were not there.
const same = (ctx) => {
  throw new Error("golden-throw: " + (ctx && ctx.hook ? ctx.hook : "hook"));
};

export default {
  hooks: {
    /**
     * Implements hook entity.before.create.
     *
     * Throws, so the platform has to carry on without it.
     */
    "entity.before.create": same,
    /**
     * Implements hook entity.before.read.
     *
     * Throws, so the platform has to carry on without it.
     */
    "entity.before.read": same,
    /**
     * Implements hook entity.before.update.
     *
     * Throws, so the platform has to carry on without it.
     */
    "entity.before.update": same,
    /**
     * Implements hook entity.before.delete.
     *
     * Throws, so the platform has to carry on without it.
     */
    "entity.before.delete": same,
    /**
     * Implements hook entity.after.create.
     *
     * Throws, so the platform has to carry on without it.
     */
    "entity.after.create": same,
    /**
     * Implements hook entity.after.read.
     *
     * Throws, so the platform has to carry on without it.
     */
    "entity.after.read": same,
    /**
     * Implements hook entity.after.update.
     *
     * Throws, so the platform has to carry on without it.
     */
    "entity.after.update": same,
    /**
     * Implements hook entity.after.delete.
     *
     * Throws, so the platform has to carry on without it.
     */
    "entity.after.delete": same,
    /**
     * Implements hook page.before.save.
     *
     * Throws, so the platform has to carry on without it.
     */
    "page.before.save": same,
    /**
     * Implements hook page.before.delete.
     *
     * Throws, so the platform has to carry on without it.
     */
    "page.before.delete": same,
    /**
     * Implements hook page.after.save.
     *
     * Throws, so the platform has to carry on without it.
     */
    "page.after.save": same,
    /**
     * Implements hook page.after.delete.
     *
     * Throws, so the platform has to carry on without it.
     */
    "page.after.delete": same,
    /**
     * Implements hook file.before.save.
     *
     * Throws, so the platform has to carry on without it.
     */
    "file.before.save": same,
    /**
     * Implements hook file.before.delete.
     *
     * Throws, so the platform has to carry on without it.
     */
    "file.before.delete": same,
    /**
     * Implements hook file.after.save.
     *
     * Throws, so the platform has to carry on without it.
     */
    "file.after.save": same,
    /**
     * Implements hook file.after.delete.
     *
     * Throws, so the platform has to carry on without it.
     */
    "file.after.delete": same,
    /**
     * Implements hook manifest.before.save.
     *
     * Throws, so the platform has to carry on without it.
     */
    "manifest.before.save": same,
    /**
     * Implements hook theme.before.change.
     *
     * Throws, so the platform has to carry on without it.
     */
    "theme.before.change": same,
    /**
     * Implements hook config.before.read.
     *
     * Throws, so the platform has to carry on without it.
     */
    "config.before.read": same,
    /**
     * Implements hook config.before.save.
     *
     * Throws, so the platform has to carry on without it.
     */
    "config.before.save": same,
    /**
     * Implements hook git.before.commit.
     *
     * Throws, so the platform has to carry on without it.
     */
    "git.before.commit": same,
    /**
     * Implements hook transaction.before.start.
     *
     * Throws, so the platform has to carry on without it.
     */
    "transaction.before.start": same,
    /**
     * Implements hook transaction.before.end.
     *
     * Throws, so the platform has to carry on without it.
     */
    "transaction.before.end": same,
    /**
     * Implements hook rest.before.request.
     *
     * Throws, so the platform has to carry on without it.
     */
    "rest.before.request": same,
    /**
     * Implements hook site.before.create.
     *
     * Throws, so the platform has to carry on without it.
     */
    "site.before.create": same,
    /**
     * Implements hook site.before.duplicate.
     *
     * Throws, so the platform has to carry on without it.
     */
    "site.before.duplicate": same,
    /**
     * Implements hook site.before.archive.
     *
     * Throws, so the platform has to carry on without it.
     */
    "site.before.archive": same,
    /**
     * Implements hook site.before.delete.
     *
     * Throws, so the platform has to carry on without it.
     */
    "site.before.delete": same,
    /**
     * Implements hook site.before.export.
     *
     * Throws, so the platform has to carry on without it.
     */
    "site.before.export": same,
    /**
     * Implements hook user.before.login.
     *
     * Throws, so the platform has to carry on without it.
     */
    "user.before.login": same,
    /**
     * Implements hook user.before.logout.
     *
     * Throws, so the platform has to carry on without it.
     */
    "user.before.logout": same,
    /**
     * Implements hook manifest.after.save.
     *
     * Throws, so the platform has to carry on without it.
     */
    "manifest.after.save": same,
    /**
     * Implements hook theme.after.change.
     *
     * Throws, so the platform has to carry on without it.
     */
    "theme.after.change": same,
    /**
     * Implements hook config.after.read.
     *
     * Throws, so the platform has to carry on without it.
     */
    "config.after.read": same,
    /**
     * Implements hook config.after.save.
     *
     * Throws, so the platform has to carry on without it.
     */
    "config.after.save": same,
    /**
     * Implements hook git.after.commit.
     *
     * Throws, so the platform has to carry on without it.
     */
    "git.after.commit": same,
    /**
     * Implements hook transaction.after.start.
     *
     * Throws, so the platform has to carry on without it.
     */
    "transaction.after.start": same,
    /**
     * Implements hook transaction.after.end.
     *
     * Throws, so the platform has to carry on without it.
     */
    "transaction.after.end": same,
    /**
     * Implements hook rest.after.request.
     *
     * Throws, so the platform has to carry on without it.
     */
    "rest.after.request": same,
    /**
     * Implements hook site.after.create.
     *
     * Throws, so the platform has to carry on without it.
     */
    "site.after.create": same,
    /**
     * Implements hook site.after.duplicate.
     *
     * Throws, so the platform has to carry on without it.
     */
    "site.after.duplicate": same,
    /**
     * Implements hook site.after.archive.
     *
     * Throws, so the platform has to carry on without it.
     */
    "site.after.archive": same,
    /**
     * Implements hook site.after.delete.
     *
     * Throws, so the platform has to carry on without it.
     */
    "site.after.delete": same,
    /**
     * Implements hook site.after.export.
     *
     * Throws, so the platform has to carry on without it.
     */
    "site.after.export": same,
    /**
     * Implements hook user.after.login.
     *
     * Throws, so the platform has to carry on without it.
     */
    "user.after.login": same,
    /**
     * Implements hook user.after.logout.
     *
     * Throws, so the platform has to carry on without it.
     */
    "user.after.logout": same,
    /**
     * Implements hook render.before.head.
     *
     * Throws, so the platform has to carry on without it.
     */
    "render.before.head": same,
    /**
     * Implements hook render.after.head.
     *
     * Throws, so the platform has to carry on without it.
     */
    "render.after.head": same,
    /**
     * Implements hook render.before.body.
     *
     * Throws, so the platform has to carry on without it.
     */
    "render.before.body": same,
    /**
     * Implements hook render.after.body.
     *
     * Throws, so the platform has to carry on without it.
     */
    "render.after.body": same,
    /**
     * Implements hook render.before.content.
     *
     * Throws, so the platform has to carry on without it.
     */
    "render.before.content": same,
    /**
     * Implements hook render.after.content.
     *
     * Throws, so the platform has to carry on without it.
     */
    "render.after.content": same,
  },
};
