// Set username from localStorage (same as dashboard.js)
document.addEventListener('DOMContentLoaded', function() {
    const userEmail = localStorage.getItem('userEmail') || 'User';
    const usernameEl = document.getElementById('username');
    if (usernameEl) {
        usernameEl.textContent = userEmail.split('@')[0];
    }
});
/* ========================================
   PREDICTION PAGE - JAVASCRIPT
   Clean, production-ready implementation
   ======================================== */

'use strict';
// Protect Prediction Page
document.addEventListener('DOMContentLoaded', function () {
    const token = localStorage.getItem('idToken');

    if (!token) {
        window.location.href = '/login';
        return;
    }
});

// Single source of truth for charts and state
let forecastChart = null;
let performanceChart = null;
let currentSymbol = '';
let dataLoaded = false;
let apiBase = '';

// DOM elements (IDs required by HTML)
const loadLiveDataBtn = document.getElementById('loadLiveDataBtn');
const loadSampleDataBtn = document.getElementById('loadSampleDataBtn');
const predictBtn = document.getElementById('predictBtn');
const stockSymbolInput = document.getElementById('stockSymbolInput');
const predictionDaysInput = document.getElementById('predictionDaysInput');
const forecastCanvas = document.getElementById('forecastChart');
const performanceCanvas = document.getElementById('performanceChart');
const dataTable = document.getElementById('dataTable');

// Autocomplete state and elements
let autocompleteTimeout = null;
let selectedSuggestionIndex = -1;
const autocompleteDropdown = document.getElementById('stockAutocompleteDropdown');
const suggestionsList = document.getElementById('stockSuggestionsList');

// Simple notification (replace with real UI if present)
function showNotification(message, type = 'info') {
    // type: info, success, warning, error
    console.log(`[${type.toUpperCase()}] ${message}`);
}

/* ========================================
   STOCK SYMBOL AUTOCOMPLETE MODULE
   ======================================== */

async function searchStockSymbols(query) {
    if (!query || query.length < 2) {
        hideAutocompleteSuggestions();
        return;
    }

    try {
        const idToken = localStorage.getItem('idToken');
        const headers = { 'Content-Type': 'application/json' };
        if (idToken) headers['Authorization'] = idToken;

        showAutocompleteSuggestions([]);
        showAutocompleteLoading();

        const response = await fetch(`${apiBase}/api/search-stock?q=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            if (response.status === 401) {
                console.warn('Session expired');
                hideAutocompleteSuggestions();
                return;
            }
            throw new Error('Search failed');
        }

        const data = await response.json();
        
        if (data.success && Array.isArray(data.results)) {
            showAutocompleteSuggestions(data.results);
        } else {
            showAutocompleteEmpty();
        }
    } catch (error) {
        console.error('Stock search error:', error);
        showAutocompleteEmpty();
    }
}

function showAutocompleteSuggestions(suggestions) {
    if (!suggestionsList) return;

    selectedSuggestionIndex = -1;

    if (!suggestions || suggestions.length === 0) {
        showAutocompleteEmpty();
        return;
    }

    suggestionsList.innerHTML = suggestions.map((stock, index) => `
        <li class="stock-suggestion-item" data-index="${index}" onclick="selectStockSuggestion('${stock.symbol}', event)">
            <div class="stock-suggestion-symbol">${stock.symbol}</div>
            <div class="stock-suggestion-name">${stock.name}</div>
        </li>
    `).join('');

    if (autocompleteDropdown) {
        autocompleteDropdown.style.display = 'block';
    }
}

function showAutocompleteLoading() {
    if (!suggestionsList) return;
    suggestionsList.innerHTML = '<li class="stock-suggestion-loading">Searching...</li>';
    if (autocompleteDropdown) autocompleteDropdown.style.display = 'block';
}

function showAutocompleteEmpty() {
    if (!suggestionsList) return;
    suggestionsList.innerHTML = '<li class="stock-suggestion-empty">No stocks found</li>';
    if (autocompleteDropdown) autocompleteDropdown.style.display = 'block';
}

function hideAutocompleteSuggestions() {
    if (autocompleteDropdown) {
        autocompleteDropdown.style.display = 'none';
    }
    suggestionsList.innerHTML = '';
    selectedSuggestionIndex = -1;
}

function selectStockSuggestion(symbol, event) {
    event.preventDefault();
    event.stopPropagation();
    
    if (stockSymbolInput) {
        stockSymbolInput.value = symbol.toUpperCase();
    }
    
    hideAutocompleteSuggestions();
    
    // Optional: Focus on prediction days input for better UX
    if (predictionDaysInput) {
        predictionDaysInput.focus();
    }
}

function debounceStockSearch(query) {
    if (autocompleteTimeout) {
        clearTimeout(autocompleteTimeout);
    }

    if (!query || query.length < 2) {
        hideAutocompleteSuggestions();
        return;
    }

    autocompleteTimeout = setTimeout(() => {
        searchStockSymbols(query);
    }, 300); // 300ms debounce
}

function handleStockInputChange(event) {
    const query = event.target.value.trim().toUpperCase();
    debounceStockSearch(query);
}

function handleStockInputKeyDown(event) {
    const items = suggestionsList?.querySelectorAll('.stock-suggestion-item') || [];
    
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, items.length - 1);
        updateSuggestionHighlight(items);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
        updateSuggestionHighlight(items);
    } else if (event.key === 'Enter') {
        event.preventDefault();
        if (selectedSuggestionIndex >= 0 && items[selectedSuggestionIndex]) {
            const symbol = items[selectedSuggestionIndex].querySelector('.stock-suggestion-symbol')?.textContent || '';
            selectStockSuggestion(symbol, event);
        }
    } else if (event.key === 'Escape') {
        hideAutocompleteSuggestions();
    }
}

function updateSuggestionHighlight(items) {
    items.forEach((item, index) => {
        if (index === selectedSuggestionIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

// Close dropdown when clicking outside
document.addEventListener('click', function (event) {
    const inputElement = stockSymbolInput;
    const dropdown = autocompleteDropdown;
    
    if (inputElement && dropdown && event.target !== inputElement) {
        if (!dropdown.contains(event.target)) {
            hideAutocompleteSuggestions();
        }
    }
});

// Initialize charts if Chart.js is available
function initializeCharts() {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not found. Charts will be disabled.');
        return;
    }

    if (forecastCanvas && !forecastChart) {
        const ctx = forecastCanvas.getContext('2d');
        forecastChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Forecast',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: '#0f172a',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: '#cbd5e1',
                            font: { size: 12, weight: '500' }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Date',
                            color: '#cbd5e1',
                            font: { size: 12, weight: '600' }
                        },
                        grid: { color: 'rgba(71, 85, 105, 0.3)' },
                        ticks: { color: '#cbd5e1' }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Price (₹)',
                            color: '#cbd5e1',
                            font: { size: 12, weight: '600' }
                        },
                        grid: { color: 'rgba(71, 85, 105, 0.3)' },
                        ticks: { color: '#cbd5e1' }
                    }
                }
            }
        });
    }

    if (performanceCanvas && !performanceChart) {
        const ctx = performanceCanvas.getContext('2d');
        performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Actual',
                        data: [],
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        fill: true,
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#2563eb',
                        pointBorderColor: '#0f172a',
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Predicted',
                        data: [],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#10b981',
                        pointBorderColor: '#0f172a',
                        pointBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: '#cbd5e1',
                            font: { size: 12, weight: '500' }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Date',
                            color: '#cbd5e1',
                            font: { size: 12, weight: '600' }
                        },
                        grid: { color: 'rgba(71, 85, 105, 0.3)' },
                        ticks: { color: '#cbd5e1' }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Price (₹)',
                            color: '#cbd5e1',
                            font: { size: 12, weight: '600' }
                        },
                        grid: { color: 'rgba(71, 85, 105, 0.3)' },
                        ticks: { color: '#cbd5e1' }
                    }
                }
            }
        });
    }
}

// Utility: format dates array for charts
function formatDates(dates) {
    return dates.map(d => {
        try { return new Date(d).toLocaleDateString('en-IN'); } catch(e){ return d; }
    });
}

// Update ONLY Future Forecast chart
function updateCharts(dates, predicted) {
    if (forecastChart) {
        forecastChart.data.labels = formatDates(dates);
        forecastChart.data.datasets[0].data = predicted;
        forecastChart.update();
        forecastChart.resize();
    }
}

// Update Model Evaluation chart with historical test data
function updateEvaluationChart(dates, actual, predicted) {
    if (performanceChart) {
        performanceChart.data.labels = formatDates(dates);
        performanceChart.data.datasets[0].data = actual;
        performanceChart.data.datasets[1].data = predicted;
        performanceChart.update();
        performanceChart.resize();
    }
}

// Render simple data table if present
function renderTable(data) {
    if (!dataTable) return;
    if (!Array.isArray(data) || data.length === 0) {
        dataTable.innerHTML = '<tr><td colspan="6">No data available.</td></tr>';
        return;
    }
    const headers = Object.keys(data[0]);
    let html = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
    html += data.map(r => '<tr>' + headers.map(h => `<td>${r[h]}</td>`).join('') + '</tr>').join('');
    dataTable.innerHTML = html;
}

// Shared function to call /api/load-data
async function loadData(symbol, useSample = false) {
    if (!symbol) { showNotification('Please enter a stock symbol', 'warning'); return null; }

    const btn = useSample ? loadSampleDataBtn : loadLiveDataBtn;
    btn.disabled = true;
    try {
        const idToken = localStorage.getItem('idToken');
        const headers = { 'Content-Type': 'application/json' };
        if (idToken) headers['Authorization'] = idToken;

        const res = await fetch(`${apiBase}/api/load-data`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ symbol, use_sample: useSample })
        });

        if (res.status === 401) {
            showNotification('Session expired. Please login again.', 'error');
            localStorage.removeItem('idToken');
            window.location.href = '/login';
            return null;
        }

        const data = await res.json();
        if (!data || !data.success) {
            showNotification('Failed to load data: ' + (data && data.error ? data.error : 'Unknown'), 'error');
            return null;
        }

        dataLoaded = true;
        currentSymbol = symbol;
        renderTable(data.records_data || data.sample_data || data.data || []);
        
        // Show data status section with visual confirmation
        const statusSection = document.getElementById('dataStatusSection');
        const statusIcon = document.getElementById('dataStatusIcon');
        const statusText = document.getElementById('dataStatusText');
        
        if (statusSection) {
            statusSection.style.display = 'block';
            // Set border color: green for live, blue for sample
            statusSection.style.borderLeftColor = useSample ? 'var(--accent-blue)' : 'var(--accent-green)';
            statusSection.style.backgroundColor = useSample 
                ? 'rgba(37, 99, 235, 0.1)' 
                : 'rgba(16, 185, 129, 0.1)';
        }
        
        if (statusIcon) {
            statusIcon.textContent = useSample ? '📦' : '📊';
        }
        
        if (statusText) {
            const dataType = useSample ? 'sample' : 'live';
            statusText.textContent = `${symbol} ${dataType} data loaded successfully`;
        }
        
        // Enable Predict button and add glow effect
        if (predictBtn) {
            predictBtn.disabled = false;
            predictBtn.classList.add('glow-active');
        }
        
        showNotification((useSample ? 'Sample' : 'Live') + ' data loaded', 'success');
        return data;
    } catch (err) {
        console.error('loadData error', err);
        showNotification('Error loading data: ' + err.message, 'error');
        return null;
    } finally {
        btn.disabled = false;
    }
}

// Called by "Load Live Data" button
async function loadLiveData() {
    const symbol = (stockSymbolInput && stockSymbolInput.value || '').trim().toUpperCase();
    await loadData(symbol, false);
}

// Called by "Use Sample Data" button
async function loadSampleData() {
    const symbol = (stockSymbolInput && stockSymbolInput.value || '').trim().toUpperCase();
    await loadData(symbol, true);
}

// Progress bar animation during prediction
let progressInterval = null;
let pipelineTimeouts = [];

function startProgressAnimation() {
    const progressFill = document.getElementById('progressBarFill');
    const progressPercent = document.getElementById('progressPercent');
    if (!progressFill || !progressPercent) return;
    
    let progress = 0;
    clearInterval(progressInterval);
    
    progressInterval = setInterval(() => {
        if (progress < 95) {
            progress += Math.random() * 15;
            if (progress > 95) progress = 95;
        }
        progressFill.style.width = progress + '%';
        progressPercent.textContent = Math.round(progress) + '%';
    }, 300);
}

function stopProgressAnimation() {
    clearInterval(progressInterval);
    const progressFill = document.getElementById('progressBarFill');
    const progressPercent = document.getElementById('progressPercent');
    if (progressFill && progressPercent) {
        progressFill.style.width = '100%';
        progressPercent.textContent = '100%';
    }
}

function resetProgressBar() {
    const progressFill = document.getElementById('progressBarFill');
    const progressPercent = document.getElementById('progressPercent');
    if (progressFill && progressPercent) {
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';
    }
}

// Pipeline section visibility management
function showPipelineSection() {
    const section = document.getElementById('pipelineSection');
    if (section) section.style.display = 'block';
}

function hidePipelineSection() {
    const section = document.getElementById('pipelineSection');
    if (section) section.style.display = 'none';
}

// Reset all pipeline steps to pending state
function resetPipelineSteps() {
    const steps = ['step-fetch', 'step-preprocess', 'step-train', 'step-eval', 'step-predict'];
    steps.forEach(stepId => {
        const step = document.getElementById(stepId);
        if (step) {
            step.className = 'pipeline-step';
            const indicator = step.querySelector('.step-indicator');
            if (indicator) {
                indicator.className = 'step-indicator pending';
                indicator.innerHTML = '<span style="font-size:18px;">⏳</span>';
            }
            const status = step.querySelector('.step-status');
            if (status) status.textContent = 'Waiting...';
        }
    });
}

// Update a single pipeline step
function updatePipelineStep(stepId, state, message) {
    const step = document.getElementById(stepId);
    if (!step) return;
    
    const indicator = step.querySelector('.step-indicator');
    const status = step.querySelector('.step-status');
    
    if (state === 'active') {
        step.className = 'pipeline-step active';
        if (indicator) {
            indicator.className = 'step-indicator active';
            indicator.innerHTML = '<span style="font-size:18px;animation:spin 1s linear infinite;">⚙️</span>';
        }
    } else if (state === 'completed') {
        step.className = 'pipeline-step completed';
        if (indicator) {
            indicator.className = 'step-indicator completed';
            indicator.innerHTML = '<span style="font-size:18px;">✅</span>';
        }
    }
    
    if (status) status.textContent = message;
}

// Simulate realistic pipeline progress with timed steps
function simulatePipelineProgress() {
    // Clear any previous timeouts
    pipelineTimeouts.forEach(t => clearTimeout(t));
    pipelineTimeouts = [];
    
    const steps = [
        { id: 'step-fetch', message: 'Data fetched', delay: 500 },
        { id: 'step-preprocess', message: 'Data preprocessed', delay: 1500 },
        { id: 'step-train', message: 'Training LSTM', delay: 3000 },
        { id: 'step-eval', message: 'Evaluating model', delay: 5500 },
        { id: 'step-predict', message: 'Generating prediction', delay: 7000 }
    ];
    
    steps.forEach((step, idx) => {
        const t = setTimeout(() => {
            updatePipelineStep(step.id, 'active', step.message + '...');
        }, step.delay);
        pipelineTimeouts.push(t);
    });
}

// Mark all steps as completed
function completePipelineSteps() {
    // Clear pending timeouts
    pipelineTimeouts.forEach(t => clearTimeout(t));
    pipelineTimeouts = [];
    
    const steps = [
        { id: 'step-fetch', message: 'Data fetched' },
        { id: 'step-preprocess', message: 'Data preprocessed' },
        { id: 'step-train', message: 'Training complete' },
        { id: 'step-eval', message: 'Evaluation complete' },
        { id: 'step-predict', message: 'Prediction ready' }
    ];
    
    steps.forEach(step => {
        updatePipelineStep(step.id, 'completed', step.message);
    });
}



// Fetch model evaluation metrics and update evaluation chart
async function loadAndUpdateEvaluation(symbol) {
    try {
        const idToken = localStorage.getItem('idToken');
        const headers = { 'Content-Type': 'application/json' };
        if (idToken) headers['Authorization'] = idToken;

        const res = await fetch(`${apiBase}/api/evaluate`, {
            method: 'GET',
            headers
        });

        if (res.status === 401) {
            console.warn('Session expired, evaluation data not available');
            return;
        }

        const evalData = await res.json();
        if (evalData && evalData.success) {
            // Update evaluation chart with historical test data
            if (evalData.actual && Array.isArray(evalData.actual) && evalData.predictions && Array.isArray(evalData.predictions)) {
                // Generate dates if not provided by backend
                let dates = evalData.dates;
                if (!dates || !Array.isArray(dates)) {
                    dates = [];
                    const startDate = new Date();
                    for (let i = 0; i < evalData.actual.length; i++) {
                        const d = new Date(startDate);
                        d.setDate(startDate.getDate() - (evalData.actual.length - i));
                        dates.push(d.toISOString().split('T')[0]);
                    }
                }
                updateEvaluationChart(dates, evalData.actual, evalData.predictions);
            }
            
            // Update MAPE accuracy metric from metrics object
            if (evalData.metrics && evalData.metrics.mape !== undefined && evalData.metrics.mape !== null) {
                const modelAccuracyEl = document.getElementById('model-accuracy');
                if (modelAccuracyEl) {
                    modelAccuracyEl.textContent = evalData.metrics.mape.toFixed(2) + '%';
                }
            }
        }
    } catch (err) {
        console.warn('Could not load evaluation data:', err.message);
    }
}

// Predict using /api/predict-future
async function predictStock() {
    // Prevent double-click
    if (predictBtn.disabled) return;
    
    const symbol = (stockSymbolInput && stockSymbolInput.value || '').trim().toUpperCase();
    const days = parseInt((predictionDaysInput && predictionDaysInput.value) || '15', 10);

    if (!symbol) { showNotification('Please enter a stock symbol', 'warning'); return; }
    if (!dataLoaded || !currentSymbol || currentSymbol !== symbol) {
        showNotification('Please load data first (Live or Sample)', 'warning');
        return;
    }

    // Disable button, show pipeline, reset progress
    predictBtn.disabled = true;
    showPipelineSection();
    resetProgressBar();
    resetPipelineSteps();
    startProgressAnimation();
    simulatePipelineProgress();
    
    try {
        const idToken = localStorage.getItem('idToken');
        const headers = { 'Content-Type': 'application/json' };
        if (idToken) headers['Authorization'] = idToken;

        const res = await fetch(`${apiBase}/api/predict-future`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ symbol, days })
        });

        if (res.status === 401) {
            stopProgressAnimation();
            completePipelineSteps();
            showNotification('Session expired. Please login again.', 'error');
            localStorage.removeItem('idToken');
            window.location.href = '/login';
            return;
        }

        const data = await res.json();
        if (data && data.success && Array.isArray(data.predictions)) {
            stopProgressAnimation();
            completePipelineSteps();
            updateCharts(data.dates || generateDates(days), data.predictions);
            
            // Load and update evaluation chart with historical test data
            await loadAndUpdateEvaluation(symbol);
            
            // Update UI elements with prediction results
            const currentPrice = data.current_price || 0;
            const nextPrice = data.predictions[0] || 0;
            const changePercent = currentPrice > 0 ? ((nextPrice - currentPrice) / currentPrice) * 100 : 0;
            const isPositive = changePercent >= 0;
            
            // Update current price display
            const currentPriceEl = document.getElementById('current-price');
            if (currentPriceEl) {
                currentPriceEl.textContent = '₹ ' + currentPrice.toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            }
            
            // Update current price label with symbol
            const currentPriceLabelEl = document.getElementById('current-price-label');
            if (currentPriceLabelEl) {
                currentPriceLabelEl.textContent = data.symbol || 'RELIANCE.NS';
            }
            
            // Update current price time
            const currentPriceTimeEl = document.getElementById('current-price-time');
            if (currentPriceTimeEl) {
                const now = new Date();
                const timeStr = now.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });
                currentPriceTimeEl.textContent = 'Updated at ' + timeStr;
            }
            
            // Update next day prediction
            const nextPriceEl = document.getElementById('next-price');
            if (nextPriceEl) {
                nextPriceEl.textContent = '₹ ' + nextPrice.toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            }
            
            // Update next day change with color
            const nextPriceChangeEl = document.getElementById('next-price-change');
            if (nextPriceChangeEl) {
                const changeText = isPositive 
                    ? `+${changePercent.toFixed(2)}% ↑` 
                    : `-${Math.abs(changePercent).toFixed(2)}% ↓`;
                nextPriceChangeEl.textContent = changeText;
                nextPriceChangeEl.style.color = isPositive ? '#10b981' : '#ef4444';
            }
            
            // Update model status
            const modelStatusEl = document.getElementById('modelStatus');
            if (modelStatusEl) {
                modelStatusEl.innerHTML = '<span style="font-size:18px;">✅</span><span class="status-text">Completed</span>';
            }
            
            showNotification('Prediction completed', 'success');
            predictBtn.disabled = false;
            return data;
        }

        // If prediction failed, fall back to generate demo data via backend
        showNotification('Prediction failed, requesting generated data', 'warning');
        const gen = await fetch(`${apiBase}/api/generate-data`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ symbol, days })
        });
        const genData = await gen.json();
        if (genData && genData.success && Array.isArray(genData.predictions)) {
            stopProgressAnimation();
            completePipelineSteps();
            updateCharts(genData.dates || generateDates(days), genData.predictions);
            
            // Load and update evaluation chart with historical test data
            await loadAndUpdateEvaluation(symbol);
            
            // Update UI elements with generated prediction results
            const currentPrice = genData.current_price || 0;
            const nextPrice = genData.predictions[0] || 0;
            const changePercent = currentPrice > 0 ? ((nextPrice - currentPrice) / currentPrice) * 100 : 0;
            const isPositive = changePercent >= 0;
            
            // Update current price display
            const currentPriceEl = document.getElementById('current-price');
            if (currentPriceEl) {
                currentPriceEl.textContent = '₹ ' + currentPrice.toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            }
            
            // Update current price label with symbol
            const currentPriceLabelEl = document.getElementById('current-price-label');
            if (currentPriceLabelEl) {
                currentPriceLabelEl.textContent = genData.symbol || 'RELIANCE.NS';
            }
            
            // Update current price time
            const currentPriceTimeEl = document.getElementById('current-price-time');
            if (currentPriceTimeEl) {
                const now = new Date();
                const timeStr = now.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });
                currentPriceTimeEl.textContent = 'Updated at ' + timeStr;
            }
            
            // Update next day prediction
            const nextPriceEl = document.getElementById('next-price');
            if (nextPriceEl) {
                nextPriceEl.textContent = '₹ ' + nextPrice.toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            }
            
            // Update next day change with color
            const nextPriceChangeEl = document.getElementById('next-price-change');
            if (nextPriceChangeEl) {
                const changeText = isPositive 
                    ? `+${changePercent.toFixed(2)}% ↑` 
                    : `-${Math.abs(changePercent).toFixed(2)}% ↓`;
                nextPriceChangeEl.textContent = changeText;
                nextPriceChangeEl.style.color = isPositive ? '#10b981' : '#ef4444';
            }
            
            // Update model status
            const modelStatusEl = document.getElementById('modelStatus');
            if (modelStatusEl) {
                modelStatusEl.innerHTML = '<span style="font-size:18px;">✅</span><span class="status-text">Completed</span>';
            }
            
            showNotification('Generated demo prediction shown', 'success');
            predictBtn.disabled = false;
            return genData;
        }

        stopProgressAnimation();
        completePipelineSteps();
        showNotification('No prediction data available', 'error');
        predictBtn.disabled = false;
        return null;
    } catch (err) {
        stopProgressAnimation();
        completePipelineSteps();
        console.error('predictStock error', err);
        showNotification('Prediction error: ' + err.message, 'error');
        predictBtn.disabled = false;
        return null;
    }
}

// Helpers to generate dates if backend doesn't provide them
function generateDates(days) {
    const out = [];
    const start = new Date();
    for (let i = 1; i <= days; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        out.push(d.toISOString().split('T')[0]);
    }
    return out;
}

// Bind event listeners and initialize
function bindUI() {
    if (loadLiveDataBtn) loadLiveDataBtn.addEventListener('click', loadLiveData);
    if (loadSampleDataBtn) loadSampleDataBtn.addEventListener('click', loadSampleData);
    if (predictBtn) predictBtn.addEventListener('click', predictStock);
    
    // Stock symbol autocomplete
    if (stockSymbolInput) {
        stockSymbolInput.addEventListener('input', handleStockInputChange);
        stockSymbolInput.addEventListener('keydown', handleStockInputKeyDown);
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initializeCharts();
    bindUI();
});

// Expose functions for debugging (optional)
window.appPrediction = {
    loadLiveData,
    loadSampleData,
    predictStock,
    updateCharts,
    updateEvaluationChart,
    loadAndUpdateEvaluation
};
