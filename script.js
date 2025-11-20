const CORS_PROXY = 'https://corsproxy.io/?';
const PYPI_BASE_URL = 'https://pypi.org/pypi';

// DOM Elements
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const loadingIndicator = document.getElementById('loading-indicator');
const resultsContainer = document.getElementById('results-container');
const emptyState = document.getElementById('empty-state');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const packageHeader = document.getElementById('package-header');
const detailsContent = document.getElementById('details-content');
const dependencyTree = document.getElementById('dependency-tree');
const expandAllBtn = document.getElementById('expand-all-btn');
const collapseAllBtn = document.getElementById('collapse-all-btn');

// State
let currentPackage = null;

// Event Listeners
searchBtn.addEventListener('click', () => handleSearch());
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});

expandAllBtn.addEventListener('click', () => toggleAllTreeNodes(true));
collapseAllBtn.addEventListener('click', () => toggleAllTreeNodes(false));

// Functions
async function handleSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    showLoading(true);
    hideError();
    resultsContainer.classList.add('hidden');
    emptyState.classList.add('hidden');

    try {
        const data = await fetchPackageData(query);
        renderPackage(data);
        showLoading(false);
        resultsContainer.classList.remove('hidden');
    } catch (error) {
        showLoading(false);
        showError(`Failed to fetch package "${query}". It might not exist or the API is unreachable.`);
        console.error(error);
    }
}

function searchFor(pkgName) {
    searchInput.value = pkgName;
    handleSearch();
}

async function fetchPackageData(packageName) {
    // Try fetching via CORS proxy
    const url = `${CORS_PROXY}${encodeURIComponent(`${PYPI_BASE_URL}/${packageName}/json`)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) throw new Error('Package not found');
            throw new Error('API Error');
        }
        return await response.json();
    } catch (error) {
        // Fallback to demo data if proxy fails or package not found (for demo purposes)
        console.warn('API fetch failed, checking demo data...', error);
        return getDemoData(packageName);
    }
}

function renderPackage(data) {
    const info = data.info;

    // Render Header
    packageHeader.innerHTML = `
        <div class="pkg-header-content">
            <div class="pkg-title">
                <h1>${info.name} <span class="pkg-version">v${info.version}</span></h1>
                <p class="pkg-description">${info.summary || 'No description available.'}</p>
            </div>
            <div class="pkg-links">
                ${info.home_page ? `<a href="${info.home_page}" target="_blank" class="icon-link" title="Homepage"><i class="fa-solid fa-house"></i></a>` : ''}
                ${info.project_urls?.Source ? `<a href="${info.project_urls.Source}" target="_blank" class="icon-link" title="Source Code"><i class="fa-brands fa-github"></i></a>` : ''}
                <a href="${info.package_url}" target="_blank" class="icon-link" title="PyPI Page"><i class="fa-brands fa-python"></i></a>
            </div>
        </div>
        <div class="install-cmd">
            <span>pip install ${info.name}</span>
            <button class="copy-btn" onclick="navigator.clipboard.writeText('pip install ${info.name}')">
                <i class="fa-regular fa-copy"></i>
            </button>
        </div>
    `;

    // Render Details
    detailsContent.innerHTML = `
        <div class="detail-item">
            <div class="detail-label">Author</div>
            <div class="detail-value">${info.author || 'Unknown'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">License</div>
            <div class="detail-value">${info.license || 'Unknown'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Requires Python</div>
            <div class="detail-value">${info.requires_python || 'Unknown'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Keywords</div>
            <div class="detail-value">${info.keywords ? info.keywords.split(',').slice(0, 5).join(', ') : 'None'}</div>
        </div>
    `;

    // Render Dependencies
    renderDependencies(info.requires_dist);
}

function renderDependencies(requiresDist) {
    dependencyTree.innerHTML = '';

    if (!requiresDist || requiresDist.length === 0) {
        dependencyTree.innerHTML = '<div class="detail-value" style="padding:1rem; color:var(--text-secondary)">No dependencies found.</div>';
        return;
    }

    // Parse dependencies (remove extra markers like "; extra == 'dev'")
    const dependencies = requiresDist.map(dep => {
        // Remove environment markers (everything after ;)
        let cleanDep = dep.split(';')[0].trim();

        // Handle extras in brackets e.g. "requests[security]" -> name: requests, version: ...
        // We want to keep the brackets for display but use the base name for fetching

        const match = cleanDep.match(/^([a-zA-Z0-9_\-\.\[\]]+)(?:\s*\((.+)\))?$/);
        if (match) {
            let name = match[1];
            let fetchName = name;
            // If name has brackets, strip them for the fetchName
            if (name.includes('[')) {
                fetchName = name.split('[')[0];
            }
            return { name: name, fetchName: fetchName, version: match[2] || 'any' };
        }
        return { name: cleanDep, fetchName: cleanDep, version: 'any' };
    });

    const rootList = document.createElement('div');
    dependencies.forEach(dep => {
        const node = createTreeNode(dep);
        rootList.appendChild(node);
    });
    dependencyTree.appendChild(rootList);
}

function createTreeNode(dep) {
    const node = document.createElement('div');
    node.className = 'tree-node';

    const content = document.createElement('div');
    content.className = 'tree-content';

    // Toggle Icon
    const toggle = document.createElement('div');
    toggle.className = 'tree-toggle';
    toggle.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';

    const name = document.createElement('span');
    name.className = 'pkg-name';
    name.textContent = dep.name;

    const ver = document.createElement('span');
    ver.className = 'pkg-ver-req';
    ver.textContent = dep.version !== 'any' ? `(${dep.version})` : '';

    content.appendChild(toggle);
    content.appendChild(name);
    content.appendChild(ver);

    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';

    // Click handler to fetch sub-dependencies
    let loaded = false;
    content.addEventListener('click', async (e) => {
        e.stopPropagation();

        // Toggle UI
        const isExpanded = toggle.classList.toggle('expanded');
        childrenContainer.classList.toggle('visible');

        if (isExpanded && !loaded) {
            // Show loading placeholder
            childrenContainer.innerHTML = '<div style="padding-left:1.5rem; color:var(--text-secondary); font-size:0.8rem;">Loading...</div>';

            try {
                const data = await fetchPackageData(dep.fetchName || dep.name);
                loaded = true;
                childrenContainer.innerHTML = ''; // Clear loading

                if (data.info.requires_dist && data.info.requires_dist.length > 0) {
                    data.info.requires_dist.forEach(subDepStr => {
                        const cleanSub = subDepStr.split(';')[0].trim();
                        const match = cleanSub.match(/^([a-zA-Z0-9_\-\.\[\]]+)(?:\s*\((.+)\))?$/);

                        let subName = cleanSub;
                        let subFetchName = cleanSub;
                        let subVer = 'any';

                        if (match) {
                            subName = match[1];
                            subFetchName = subName.includes('[') ? subName.split('[')[0] : subName;
                            subVer = match[2] || 'any';
                        }

                        childrenContainer.appendChild(createTreeNode({ name: subName, fetchName: subFetchName, version: subVer }));
                    });
                } else {
                    childrenContainer.innerHTML = '<div style="padding-left:1.5rem; color:var(--text-secondary); font-size:0.8rem;">No dependencies</div>';
                }
            } catch (err) {
                childrenContainer.innerHTML = '<div style="padding-left:1.5rem; color:var(--error); font-size:0.8rem;">Failed to load</div>';
            }
        }
    });

    node.appendChild(content);
    node.appendChild(childrenContainer);
    return node;
}

function toggleAllTreeNodes(expand) {
    const toggles = document.querySelectorAll('.tree-toggle');
    const children = document.querySelectorAll('.tree-children');

    toggles.forEach(t => {
        if (expand) t.classList.add('expanded');
        else t.classList.remove('expanded');
    });

    children.forEach(c => {
        if (expand) c.classList.add('visible');
        else c.classList.remove('visible');
    });
}

function showLoading(show) {
    if (show) loadingIndicator.classList.remove('hidden');
    else loadingIndicator.classList.add('hidden');
}

function showError(msg) {
    errorText.textContent = msg;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}

// Mock Data for Demo Mode (Fallback)
function getDemoData(name) {
    const mockDb = {
        'requests': {
            info: {
                name: 'requests',
                version: '2.31.0',
                summary: 'Python HTTP for Humans.',
                author: 'Kenneth Reitz',
                license: 'Apache 2.0',
                requires_python: '>=3.7',
                home_page: 'https://requests.readthedocs.io',
                package_url: 'https://pypi.org/project/requests/',
                requires_dist: [
                    "charset-normalizer (<4,>=2)",
                    "idna (<4,>=2.5)",
                    "urllib3 (<3,>=1.21.1)",
                    "certifi (>=2017.4.17)"
                ]
            }
        },
        'flask': {
            info: {
                name: 'Flask',
                version: '3.0.0',
                summary: 'A simple framework for building complex web applications.',
                author: 'Armin Ronacher',
                license: 'BSD-3-Clause',
                requires_python: '>=3.8',
                home_page: 'https://flask.palletsprojects.com/',
                package_url: 'https://pypi.org/project/Flask/',
                requires_dist: [
                    "Werkzeug (>=3.0.0)",
                    "Jinja2 (>=3.1.2)",
                    "itsdangerous (>=2.1.2)",
                    "click (>=8.1.3)",
                    "blinker (>=1.6.2)"
                ]
            }
        },
        'numpy': {
            info: {
                name: 'numpy',
                version: '1.26.0',
                summary: 'Fundamental package for array computing in Python',
                author: 'Travis E. Oliphant et al.',
                license: 'BSD-3-Clause',
                requires_python: '>=3.9',
                home_page: 'https://numpy.org',
                package_url: 'https://pypi.org/project/numpy/',
                requires_dist: []
            }
        },
        // Expanded Mock Data for Dependencies
        'urllib3': { info: { name: 'urllib3', version: '2.0.7', summary: 'HTTP library with thread-safe connection pooling', requires_dist: [] } },
        'idna': { info: { name: 'idna', version: '3.4', summary: 'Internationalized Domain Names in Applications', requires_dist: [] } },
        'charset-normalizer': { info: { name: 'charset-normalizer', version: '3.3.2', summary: 'The Real First Universal Charset Detector', requires_dist: [] } },
        'certifi': { info: { name: 'certifi', version: '2023.7.22', summary: 'Python package for providing Mozilla\'s CA Bundle.', requires_dist: [] } },
        'werkzeug': { info: { name: 'Werkzeug', version: '3.0.1', summary: 'The comprehensive WSGI web application library.', requires_dist: ['MarkupSafe (>=2.1.1)'] } },
        'jinja2': { info: { name: 'Jinja2', version: '3.1.2', summary: 'A very fast and expressive template engine.', requires_dist: ['MarkupSafe (>=2.0)'] } },
        'itsdangerous': { info: { name: 'itsdangerous', version: '2.1.2', summary: 'Safely pass data to untrusted environments and back.', requires_dist: [] } },
        'click': { info: { name: 'click', version: '8.1.7', summary: 'Composable command line interface toolkit', requires_dist: ['colorama; platform_system == "Windows"'] } },
        'blinker': { info: { name: 'blinker', version: '1.7.0', summary: 'Fast and simple object-to-object and broadcast signaling', requires_dist: [] } },
        'markupsafe': { info: { name: 'MarkupSafe', version: '2.1.3', summary: 'Safely add untrusted strings to HTML/XML markup.', requires_dist: [] } }
    };

    return new Promise((resolve) => {
        setTimeout(() => {
            const key = name.toLowerCase();
            if (mockDb[key]) {
                resolve(mockDb[key]);
            } else {
                // Generative Fallback: Create a fake package for any unknown name
                // This ensures the UI is always explorable even if the API/Proxy fails
                console.warn(`Generating mock data for: ${name}`);
                resolve({
                    info: {
                        name: name,
                        version: '0.0.1-mock',
                        summary: `This is a generated placeholder for "${name}" (API unreachable).`,
                        author: 'Demo Generator',
                        license: 'MIT',
                        requires_python: '>=3.6',
                        home_page: '#',
                        package_url: '#',
                        requires_dist: [
                            // Generate some random sub-dependencies to keep the tree growing
                            'requests',
                            'numpy',
                            `sub-dep-of-${name}-1`,
                            `sub-dep-of-${name}-2`
                        ]
                    }
                });
            }
        }, 500);
    });
}
