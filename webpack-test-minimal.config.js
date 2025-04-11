const path = require('path');

module.exports = {
  target: 'node',
  mode: 'development',
  entry: './src/extension-minimal.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension-minimal.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
}; 