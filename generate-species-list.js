#!/usr/bin/env node

/**
 * Auto-generates species list from Resources/Species directory
 * Run this script after adding/removing species JSON files
 *
 * Usage: node generate-species-list.js
 */

const fs = require('fs');
const path = require('path');

const SPECIES_DIR = path.join(__dirname, 'Resources', 'Species');
const OUTPUT_FILE = path.join(__dirname, 'species-list.js');

function generateSpeciesList() {
  console.log('🔍 Scanning species directory:', SPECIES_DIR);

  try {
    // Read all files in the Species directory
    const files = fs.readdirSync(SPECIES_DIR);

    // Filter to only .json files and extract species IDs
    const speciesList = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''))
      .sort(); // Sort alphabetically for consistency

    console.log(`✅ Found ${speciesList.length} species`);

    // Generate the output file
    const output = `// Auto-generated species list - DO NOT EDIT MANUALLY
// Generated: ${new Date().toISOString()}
// Run 'node generate-species-list.js' to regenerate

/**
 * Complete list of all available species
 * Auto-generated from Resources/Species/*.json files
 */
(function() {
  const globalScope = typeof window !== 'undefined' ? window : self;

  if (!globalScope.SPECIES_LIST) {
    globalScope.SPECIES_LIST = ${JSON.stringify(speciesList, null, 2).replace(/\n/g, '\n    ')};
  }

  // Also export as const for ES6 modules
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ${JSON.stringify(speciesList, null, 2).replace(/\n/g, '\n  ')};
  }
})();
`;

    fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
    console.log('✅ Generated species-list.js with', speciesList.length, 'species');
    console.log('📝 Species:', speciesList.join(', '));

    return speciesList;
  } catch (error) {
    console.error('❌ Error generating species list:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  generateSpeciesList();
}

module.exports = generateSpeciesList;
