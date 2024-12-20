let currentUser = null;
let charts = {};

async function checkAuthStatus() {
    try {
        const response = await fetch('/auth/user', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            showAuthenticatedUI();
            loadRecentFiles();
        } else {
            showLoginUI();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        showLoginUI();
    }
}

function showLoginUI() {
    document.getElementById('authContainer').style.display = 'block';
    document.getElementById('mainContainer').style.display = 'none';
}

function showAuthenticatedUI() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'block';
    document.getElementById('userAvatar').src = currentUser.img_url;
    document.getElementById('userName').textContent = currentUser.handle;
}

function loginWithFigma() {
    window.location.href = '/auth/figma';
}

function logout() {
    window.location.href = '/auth/logout';
}

async function loadRecentFiles() {
    try {
        const response = await fetch('/api/recent-files', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            const recentFilesList = document.getElementById('recentFilesList');
            
            recentFilesList.innerHTML = data.recentFiles
                .map(file => `
                    <div class="recent-file-item" onclick="analyzeFile('${file.fileKey}')">
                        <div>
                            <strong>${file.fileName}</strong>
                            <br>
                            <small>Last accessed: ${new Date(file.lastAccessed).toLocaleDateString()}</small>
                        </div>
                    </div>
                `)
                .join('');
        }
    } catch (error) {
        console.error('Failed to load recent files:', error);
    }
}

async function analyzeFile(fileKey) {
    const urlInput = document.getElementById('figma-url');
    const url = fileKey || urlInput.value.trim();
    
    if (!url) {
        showError('Please enter a Figma file URL');
        return;
    }

    try {
        showLoading(true);
        showError(''); // Clear any previous errors
        
        console.log('Analyzing file:', url);
        const response = await fetch(`/api/analyze?url=${encodeURIComponent(url)}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || data.details || 'Failed to analyze file');
        }

        console.log('Analysis response:', data);

        if (!data.stats || !data.personality) {
            console.error('Invalid analysis data:', data);
            throw new Error('Invalid analysis data received');
        }

        // Update UI with results
        displayResults(data);
        
        updateRecentFiles(data.fileId, data.fileName);
    } catch (error) {
        console.error('Analysis error:', error);
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

function createCollapsibleSection(title, content) {
    return `
        <div class="section-header" onclick="toggleSection(this)">
            <h3>${title}</h3>
            <span class="toggle-icon">›</span>
        </div>
        <div class="section-content">
            ${content}
        </div>
    `;
}

function toggleSection(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.toggle-icon');
    content.classList.toggle('expanded');
    icon.classList.toggle('expanded');
}

function deleteRecentFile(fileId) {
    let recentFiles = JSON.parse(localStorage.getItem('recentFiles') || '[]');
    recentFiles = recentFiles.filter(file => file.id !== fileId);
    localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
    displayRecentFiles();
}

function displayRecentFiles() {
    const recentFiles = JSON.parse(localStorage.getItem('recentFiles') || '[]');
    const recentFilesList = document.getElementById('recentFilesList');
    
    if (recentFiles.length === 0) {
        recentFilesList.innerHTML = '<p class="no-files">No recent files</p>';
        return;
    }
    
    recentFilesList.innerHTML = recentFiles.map(file => `
        <div class="recent-file-item">
            <div class="file-content" onclick="analyzeFile('${file.id}')">
                <span class="file-name">${file.name}</span>
                <span class="file-date">${new Date(file.date).toLocaleDateString()}</span>
            </div>
            <button class="delete-file" onclick="deleteRecentFile('${file.id}')">×</button>
        </div>
    `).join('');
}

function clearRecentFiles() {
    localStorage.removeItem('recentFiles');
    document.getElementById('recentFilesList').innerHTML = '';
}

function updateRecentFiles(fileId, fileName) {
    let recentFiles = JSON.parse(localStorage.getItem('recentFiles') || '[]');
    
    // Remove if already exists
    recentFiles = recentFiles.filter(file => file.id !== fileId);
    
    // Add to beginning
    recentFiles.unshift({
        id: fileId,
        name: fileName,
        date: new Date().toISOString()
    });
    
    // Keep only last 5 files
    recentFiles = recentFiles.slice(0, 5);
    
    localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
    displayRecentFiles();
}

function displayResults(data) {
    const { stats, personality, debug } = data;
    
    if (debug) {
        console.log('Debug info:', debug);
    }

    const resultsContainer = document.getElementById('analysis-results');
    resultsContainer.innerHTML = ''; // Clear previous results

    // Display personality section
    const personalitySection = document.createElement('div');
    personalitySection.className = 'analysis-section personality';
    personalitySection.innerHTML = `
        <h2>✨ Your Design Superpowers</h2>
        <div class="personality-card">
            <h3>${personality?.archetypeInfo?.emoji || '✨'} ${personality?.primaryArchetype || 'Designer'}</h3>
            <p>${personality?.archetypeInfo?.description || 'Your unique design style is being analyzed.'}</p>
            <div class="strengths-container">
                ${(personality?.archetypeInfo?.strengths || []).map(strength => `
                    <span class="strength-tag">${strength}</span>
                `).join('')}
            </div>
        </div>
        
        <div class="compatibility-card">
            <h4>🤝 Perfect Design Partner</h4>
            <p>You'd work great with a <strong>${personality?.compatibility?.archetype || 'Creative Partner'}</strong>!</p>
            <p class="compatibility-reason">${personality?.compatibility?.reason || 'Together you can create amazing designs.'}</p>
        </div>

        ${createCollapsibleSection('🎨 Fun Facts About Your Design',
            `<ul class="fun-facts">
                ${(personality?.funFacts || []).map(fact => `<li>${fact}</li>`).join('')}
            </ul>`
        )}
    `;
    resultsContainer.appendChild(personalitySection);

    // Display statistics section with collapsible parts
    const statsSection = document.createElement('div');
    statsSection.className = 'analysis-section stats';
    statsSection.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <h3>Total Layers</h3>
                <div class="stat-value">${stats?.totalLayers || 0}</div>
                <p class="stat-description">Elements in your design</p>
            </div>
            <div class="stat-card">
                <h3>Max Depth</h3>
                <div class="stat-value">${stats?.maxDepth || 0}</div>
                <p class="stat-description">Levels of hierarchy</p>
            </div>
            <div class="stat-card">
                <h3>Most Complex Frame</h3>
                <div class="stat-value">${stats?.mostComplexFrames?.[0]?.name || 'N/A'}</div>
                <p class="stat-description">${stats?.mostComplexFrames?.[0]?.childCount || 0} elements</p>
            </div>
        </div>

        ${createCollapsibleSection('Layer Types Distribution',
            `<div class="layer-types-grid">
                ${Object.entries(stats?.layerTypes || {}).map(([type, count]) => `
                    <div class="layer-type-item">
                        <span class="layer-type-name">${type}</span>
                        <span class="layer-type-count">${count}</span>
                    </div>
                `).join('')}
            </div>`
        )}

        ${createCollapsibleSection('Component Usage',
            `<div class="component-list">
                ${Object.entries(stats?.componentUsage || {}).map(([name, count]) => `
                    <div class="component-item">
                        <span class="component-name">${name}</span>
                        <span class="component-count">Used ${count} times</span>
                    </div>
                `).join('')}
            </div>`
        )}

        ${createCollapsibleSection('Typography Insights',
            `<div class="typography-grid">
                ${Object.entries(stats?.typography || {}).map(([fontKey, count]) => {
                    const [fontFamily, fontSize] = fontKey.split('-');
                    const totalFonts = Object.values(stats?.typography || {}).reduce((a, b) => a + b, 0);
                    const percentage = (count / totalFonts * 100).toFixed(1);
                    
                    return `
                        <div class="font-card">
                            <div class="font-name">${fontFamily}</div>
                            <div class="font-stats">
                                ${fontSize}px • Used ${count} times (${percentage}%)
                            </div>
                            <div class="font-preview" style="font-family: ${fontFamily}">
                                The quick brown fox jumps over the lazy dog
                            </div>
                            <div class="font-usage-bar">
                                <div class="font-usage-fill" style="width: ${percentage}%"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>`
        )}

        ${createCollapsibleSection('Color Palette',
            `<div class="color-grid">
                ${(stats?.colors || []).map(color => `
                    <div class="color-item">
                        <div class="color-preview" style="background-color: ${color}"></div>
                        <span class="color-value">${color}</span>
                    </div>
                `).join('')}
            </div>`
        )}
    `;
    resultsContainer.appendChild(statsSection);

    // Add share button
    const shareSection = document.createElement('div');
    shareSection.className = 'share-section';
    shareSection.innerHTML = `
        <button class="share-button" onclick="shareResults()">
            Share Your Design DNA 🧬
        </button>
    `;
    resultsContainer.appendChild(shareSection);

    resultsContainer.style.display = 'block';
}

function showError(message) {
    const errorContainer = document.getElementById('error-container');
    if (message) {
        errorContainer.textContent = message;
        errorContainer.style.display = 'block';
        console.error('Error:', message);
    } else {
        errorContainer.style.display = 'none';
    }
}

function showLoading(isLoading) {
    const loadingIndicator = document.getElementById('loading-indicator');
    const analyzeButton = document.querySelector('button');
    
    if (isLoading) {
        loadingIndicator.style.display = 'block';
        analyzeButton.disabled = true;
        analyzeButton.textContent = 'Analyzing...';
    } else {
        loadingIndicator.style.display = 'none';
        analyzeButton.disabled = false;
        analyzeButton.textContent = 'Analyze Design';
    }
}

function shareResults() {
    // Implement sharing functionality
    alert('Sharing feature coming soon!');
}

// Check URL parameters for login success
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('login') === 'success') {
    history.replaceState({}, document.title, '/');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    displayRecentFiles();
});
