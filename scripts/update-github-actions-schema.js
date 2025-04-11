#!/usr/bin/env node

/**
 * GitHub Actions Schema Updater
 * 
 * This script downloads the latest GitHub Actions schema and extends it to
 * include newer versions of common actions not yet in the official schema.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const yaml = require('js-yaml');

const SCHEMA_URL = 'https://json.schemastore.org/github-workflow.json';
const OUTPUT_DIR = path.join(__dirname, '..', '.vscode');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'github-workflow-extended.json');

// Latest versions of common actions to add to the schema
const LATEST_ACTIONS = {
  'actions/checkout': 'v4',
  'actions/setup-node': 'v4',
  'peter-evans/create-pull-request': 'v7',
  // Add other actions as needed
};

function downloadSchema(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download schema: ${response.statusCode}`));
        return;
      }

      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          const schema = JSON.parse(data);
          resolve(schema);
        } catch (error) {
          reject(new Error(`Failed to parse schema: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Failed to download schema: ${error.message}`));
    });
  });
}

function extendSchema(schema) {
  if (!schema.properties || !schema.properties.jobs || !schema.properties.jobs.patternProperties) {
    console.log('Schema structure not as expected. Unable to extend.');
    return schema;
  }

  // Find the steps properties in the schema
  const jobPatterns = schema.properties.jobs.patternProperties;
  const jobPattern = jobPatterns['[a-zA-Z_][a-zA-Z0-9_-]*'];
  
  if (!jobPattern || !jobPattern.properties || !jobPattern.properties.steps) {
    console.log('Job steps not found in schema. Unable to extend.');
    return schema;
  }

  const stepsItems = jobPattern.properties.steps.items;
  if (!stepsItems || !stepsItems.properties || !stepsItems.properties.uses) {
    console.log('Step uses property not found in schema. Unable to extend.');
    return schema;
  }

  // Add or update the allowed versions for common actions
  const usesPattern = stepsItems.properties.uses.pattern;
  if (usesPattern) {
    let newPattern = usesPattern;
    
    // Add custom actions to the pattern
    Object.entries(LATEST_ACTIONS).forEach(([action, version]) => {
      if (!newPattern.includes(`${action}@${version}`)) {
        // Add the new version to the pattern
        newPattern = newPattern.replace(/\$/, `|${action}@${version}$`);
      }
    });
    
    stepsItems.properties.uses.pattern = newPattern;
    console.log('Extended schema with latest action versions');
  } else {
    console.log('Uses pattern not found in schema. Unable to extend.');
  }

  return schema;
}

function saveSchema(schema, outputPath) {
  try {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));
    console.log(`Schema saved to ${outputPath}`);
  } catch (error) {
    console.error(`Failed to save schema: ${error.message}`);
  }
}

function updateVSCodeSettings(schemaPath) {
  const settingsPath = path.join(OUTPUT_DIR, 'settings.json');
  let settings = {};
  
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (error) {
      console.error(`Failed to parse settings.json: ${error.message}`);
    }
  }
  
  // Update yaml.schemas section
  settings['yaml.schemas'] = settings['yaml.schemas'] || {};
  settings['yaml.schemas'][schemaPath] = ['.github/workflows/*.yml'];
  
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log(`VSCode settings updated at ${settingsPath}`);
  } catch (error) {
    console.error(`Failed to update settings: ${error.message}`);
  }
}

async function main() {
  try {
    console.log('Downloading GitHub Actions schema...');
    const schema = await downloadSchema(SCHEMA_URL);
    
    console.log('Extending schema with latest action versions...');
    const extendedSchema = extendSchema(schema);
    
    console.log('Saving extended schema...');
    saveSchema(extendedSchema, OUTPUT_FILE);
    
    console.log('Updating VSCode settings...');
    updateVSCodeSettings(OUTPUT_FILE);
    
    console.log('Schema update completed successfully!');
  } catch (error) {
    console.error(`Schema update failed: ${error.message}`);
    process.exit(1);
  }
}

main(); 