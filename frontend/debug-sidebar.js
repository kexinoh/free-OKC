// Debug script for sidebar toggles
// Open DevTools (F12) and run this in the console

console.log('=== Sidebar Debug Info ===');

// Check if elements exist
const historyToggle = document.getElementById('history-toggle');
const historySidebar = document.getElementById('history-sidebar');
const historyPanel = document.getElementById('history-panel');

const insightToggle = document.getElementById('insight-toggle');
const insightSidebar = document.getElementById('insight-sidebar');
const insightPanelSidebar = document.getElementById('insight-panel-sidebar');

console.log('History Sidebar Elements:', {
    toggle: !!historyToggle,
    sidebar: !!historySidebar,
    panel: !!historyPanel,
    sidebarHasOpen: historySidebar?.classList.contains('open'),
});

console.log('Insight Sidebar Elements:', {
    toggle: !!insightToggle,
    sidebar: !!insightSidebar,
    panel: !!insightPanelSidebar,
    sidebarHasOpen: insightSidebar?.classList.contains('open'),
});

// Test toggle functions
console.log('\n=== Testing Toggle Functions ===');

if (historyToggle) {
    console.log('History toggle button found, you can click it or run:');
    console.log('  historyToggle.click()');
}

if (insightToggle) {
    console.log('Insight toggle button found, you can click it or run:');
    console.log('  insightToggle.click()');
}

// Manual toggle test
window.testHistoryToggle = () => {
    if (historySidebar) {
        historySidebar.classList.toggle('open');
        console.log('History sidebar toggled. Now open:', historySidebar.classList.contains('open'));
    }
};

window.testInsightToggle = () => {
    if (insightSidebar) {
        insightSidebar.classList.toggle('open');
        console.log('Insight sidebar toggled. Now open:', insightSidebar.classList.contains('open'));
    }
};

console.log('\nManual toggle functions created:');
console.log('  testHistoryToggle() - Toggle history sidebar');
console.log('  testInsightToggle() - Toggle insight sidebar');
