const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const path = require('path');

module.exports = tseslint.config(
  {
    ignores: [
      '**/node_modules/**', 
      'out/**', 
      'dist/**', 
      '**/*.d.ts',
      'webpack.config.js',
      'eslint.config.js'
    ]
  },
  
  // JavaScript-specific configuration
  {
    files: ['**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
        module: 'writable'
      }
    },
    rules: {
      'no-useless-escape': 'warn',
      'no-case-declarations': 'warn',
      'no-throw-literal': 'warn',
      'curly': 'warn',
      'eqeqeq': 'warn',
      'semi': 'off'
    }
  },
  
  // TypeScript-specific configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    ...tseslint.configs.recommended,
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: path.resolve(__dirname),
      },
    },
    rules: {
      // Rules that are errors in the default config but we're making warnings or disabling
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-useless-escape': 'warn',
      'no-case-declarations': 'warn',
      
      // Rules we're keeping as warnings
      'no-throw-literal': 'warn',
      'curly': 'warn',
      'eqeqeq': 'warn',
      
      // Disable naming convention rules for this existing project
      '@typescript-eslint/naming-convention': 'off',
      
      // Turn off semicolons rule
      'semi': 'off',
    },
  }
); 