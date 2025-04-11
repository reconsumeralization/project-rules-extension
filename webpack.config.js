//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');

/**
 * Extension host bundle configuration targeting Node.js
 * @type {import('webpack').Configuration}
 */
const extensionConfig = {
  name: 'extension',
  target: 'node',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
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
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};

/**
 * Webview bundle configuration targeting browsers
 * @type {import('webpack').Configuration}
 */
const webviewConfig = {
  target: 'web',
  entry: {
    'rulesView-ui': './src/views/webview-ui/rulesView-ui.tsx',
    'notepadView-ui': './src/views/webview-ui/notepadView-ui.tsx',
    'mcpProtocolView-ui': './src/views/webview-ui/mcpProtocolView-ui.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.css']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  devtool: 'nosources-source-map'
};

module.exports = [extensionConfig, webviewConfig];

// When you have webview UI files ready, update to:
// module.exports = [extensionConfig, webviewConfig]; 