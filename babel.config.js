module.exports = {
    plugins: ['babel-plugin-transform-dynamic-import'],
    ignore: ['./src/templates/**/*'],
    presets: [
      [
        '@babel/env',
        {
          targets: {
            node: '10',
          },
          corejs: 2,
          useBuiltIns: 'usage',
        },
      ],
    ],
  };