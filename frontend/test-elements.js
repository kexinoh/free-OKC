// Test file to verify all exports from elements.js
import * as elements from './elements.js';

console.log('=== Elements.js Export Verification ===');
console.log('All exports:', Object.keys(elements));
console.log('\nInsight-related exports:');
console.log('  insightSidebar:', elements.insightSidebar);
console.log('  insightToggle:', elements.insightToggle);
console.log('  insightPanelSidebar:', elements.insightPanelSidebar);

console.log('\nHistory-related exports:');
console.log('  historySidebar:', elements.historySidebar);
console.log('  historyToggle:', elements.historyToggle);
console.log('  historyPanel:', elements.historyPanel);
