const path = require('path');

module.exports = {
  target: 'node',
  mode: 'development',
  entry: './src/extension-test.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension-test.js',
    libraryTarget: 'commonjs2'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode',
    
    // Exclude problematic files
    './services/notepadAIService': 'commonjs ./services/notepadAIService',
    './views/webview-ui/mcpProtocolView/index': 'commonjs ./views/webview-ui/mcpProtocolView/index',
    './views/webview-ui/notepadView/index': 'commonjs ./views/webview-ui/notepadView/index' 
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: [
          /node_modules/,
          /src\/views\/webview-ui\/.*/,
          /src\/services\/notepadAIService\.ts/
        ],
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
}; 