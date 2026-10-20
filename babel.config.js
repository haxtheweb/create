module.exports = {
  plugins: ["babel-plugin-transform-dynamic-import"],
  // the SSR audit worker is plain ESM: babel would rewrite its import() calls
  // to require(), which can't load ESM-only packages (it is still copied)
  ignore: ["./src/templates/**/*", "./src/lib/programs/audit-ssr-worker.mjs"],
  presets: [
    [
      "@babel/env",
      {
        targets: {
          node: "18",
        },
        corejs: 2,
        useBuiltIns: "usage",
      },
    ],
  ],
};
