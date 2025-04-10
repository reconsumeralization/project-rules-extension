//@ts-check

'use strict';

const path = require('path');

/**
 * Extension host bundle configuration targeting Node.js
 * @type {import('webpack').Configuration}
 */
const extensionConfig = {
  name: 'extension',
  target: 'node',
  mode: 'none',
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
/*
const webviewConfig = {
  name: 'webview',
  target: 'web',
  mode: 'none',
  entry: {
    // Uncomment and update these entries as you create the webview UI files
    // 'rulesView': './src/views/webview-ui/rulesView-ui.tsx',
    // 'tasksView': './src/views/webview-ui/tasksView-ui.tsx',
    // 'mcpAgentsView': './src/views/webview-ui/mcpAgentsView-ui.tsx',
  },
  output: {
    path: path.resolve(__dirname, 'dist', 'webview'),
    filename: '[name].js',
    libraryTarget: 'window',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.webview.json' // Create a separate tsconfig for webview React code
            }
          }
        ]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|jpg|gif|svg)$/,
        use: {
          loader: 'file-loader',
          options: {
            name: '[name].[ext]',
            outputPath: 'assets',
          }
        }
      }
    ]
  },
  devtool: 'source-map',
};
*/

// For now, export only the extension config
// Later you can add the webviewConfig when you have the webview UI files ready
module.exports = extensionConfig;

// When you have webview UI files ready, update to:
// module.exports = [extensionConfig, webviewConfig]; 