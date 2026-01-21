/**
 * Validated genre clusters export
 * This module validates genreClusters.json on import and exports the validated data
 */

import rawGenreClusters from './genreClusters.json';
import { validateAndLoad } from './genreClusterValidator';

// Validate on module load - will throw if invalid
export const genreClusters = validateAndLoad(rawGenreClusters);
