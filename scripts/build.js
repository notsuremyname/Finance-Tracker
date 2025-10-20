const { execSync } = require('child_process');

// Checkout gh-pages branch
execSync('git checkout gh-pages');

// Copy the required files directly to gh-pages branch
execSync('cp index.html .');
execSync('cp -r assets .');

// Add and commit the changes
execSync('git add index.html assets/');
execSync('git commit -m "Deploy: update gh-pages branch"');

// Push to gh-pages
execSync('git push origin gh-pages');

// Switch back to main branch
execSync('git checkout main');

console.log('Deployed to gh-pages branch');
