// Species Validator - Validates species JSON structure for data integrity

// Export for use in other modules (works in both window and service worker contexts)
(function() {
  const globalScope = typeof window !== 'undefined' ? window : self;

  // Only define if not already defined (prevents redeclaration errors)
  if (!globalScope.SpeciesValidator) {
    /**
     * Schema for species data
     */
    const SPECIES_SCHEMA = {
      id: { type: 'string', required: true },
      speed: { type: 'number', required: false, default: 0 },
      fps: { type: 'number', required: false, default: 10 },
      zIndex: { type: 'number', required: false, default: 0 },
      movementPath: { type: 'string', required: false, default: 'walk' },
      dragPath: { type: 'string', required: false, default: 'drag' },
      capabilities: { type: 'array', required: false, default: [] },
      tags: { type: 'array', required: false, default: [] },
      animations: { type: 'array', required: false, default: [] }
    };

    /**
     * Validates a species data object against the schema
     * @param {Object} data - Species data to validate
     * @param {string} speciesId - ID of the species for error reporting
     * @returns {Object} - { valid: boolean, errors: Array, data: Object }
     */
    function validateSpeciesData(data, speciesId) {
      const errors = [];
      const validatedData = {};

      // Check if data exists
      if (!data || typeof data !== 'object') {
        return {
          valid: false,
          errors: [`Species ${speciesId}: Invalid data - not an object`],
          data: null
        };
      }

      // Validate each field in schema
      for (const [field, rules] of Object.entries(SPECIES_SCHEMA)) {
        const value = data[field];

        // Check required fields
        if (rules.required && (value === undefined || value === null)) {
          errors.push(`Species ${speciesId}: Missing required field '${field}'`);
          continue;
        }

        // Use default if field is missing
        if (value === undefined || value === null) {
          validatedData[field] = rules.default;
          continue;
        }

        // Type validation
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rules.type) {
          errors.push(`Species ${speciesId}: Field '${field}' should be ${rules.type}, got ${actualType}`);
          validatedData[field] = rules.default;
          continue;
        }

        // Additional validation for specific types
        if (rules.type === 'array') {
          if (field === 'animations' && value.length > 0) {
            // Validate animation objects
            value.forEach((anim, index) => {
              if (!anim.id || typeof anim.id !== 'string') {
                errors.push(`Species ${speciesId}: Animation[${index}] missing or invalid 'id' field`);
              }
            });
          }
        }

        validatedData[field] = value;
      }

      // Ensure id matches
      if (validatedData.id !== speciesId) {
        validatedData.id = speciesId;
      }

      // Copy over any additional fields not in schema (for extensibility)
      for (const field in data) {
        if (!(field in SPECIES_SCHEMA)) {
          validatedData[field] = data[field];
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        data: validatedData
      };
    }

    /**
     * Validates multiple species data objects
     * @param {Object} speciesCollection - Object containing species data keyed by ID
     * @returns {Object} - { valid: boolean, errors: Array, validSpecies: Array, invalidSpecies: Array }
     */
    function validateAllSpecies(speciesCollection) {
      const allErrors = [];
      const validSpecies = [];
      const invalidSpecies = [];

      for (const [id, data] of Object.entries(speciesCollection)) {
        const result = validateSpeciesData(data, id);

        if (result.valid) {
          validSpecies.push(id);
        } else {
          invalidSpecies.push(id);
          allErrors.push(...result.errors);
        }
      }

      return {
        valid: allErrors.length === 0,
        errors: allErrors,
        validSpecies,
        invalidSpecies,
        summary: {
          total: Object.keys(speciesCollection).length,
          valid: validSpecies.length,
          invalid: invalidSpecies.length
        }
      };
    }

    // Export to global scope
    globalScope.SpeciesValidator = {
      validateSpeciesData,
      validateAllSpecies,
      SPECIES_SCHEMA
    };
  }
})();
