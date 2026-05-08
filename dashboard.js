/* ========================================
   MARKET DASHBOARD - JAVASCRIPT
   Market Overview and Live Charts
   ======================================== */

'use strict';

// Global variables
let marketChart = null;
let currentIndex = 'sensex';
let currentPeriod = '1mo';
let marketData = {
    dates: [],
    close: [],
    volume: [],
    ma50: []
};

const API_BASE = '';

// Index mapping
const indexNames = {
    sensex: 'SENSEX',
    nifty: 'NIFTY 50',
    banknifty: 'BANKNIFTY'
};

// ========================================
// INITIALIZATION
// ========================================
// Protect Dashboard Page
document.addEventListener('DOMContentLoaded', function () {
    const token = localStorage.getItem('idToken');

    if (!token) {
        window.location.href = '/login';
        return;
    }
});
document.addEventListener('DOMContentLoaded', function() {
    const userEmail = localStorage.getItem('userEmail') || 'User';
    const usernameEl = document.getElementById('username');
    if (usernameEl) {
        usernameEl.textContent = userEmail.split('@')[0];
    }
    
    // Bind event listeners
    bindIndexSelectors();
    bindPeriodSelectors();
    
    // Load default market data: sensex, 1mo
    fetchIndexData('sensex', '1mo');
});

// ========================================
// BIND EVENT LISTENERS
// ========================================

function bindIndexSelectors() {
    const indexButtons = document.querySelectorAll('[data-index]');
    indexButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const index = this.dataset.index;
            selectIndex(index);
        });
    });
}

function bindPeriodSelectors() {
    const periodButtons = document.querySelectorAll('[data-period]');
    periodButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const period = this.dataset.period;
            selectPeriod(period);
        });
    });
}

// ========================================
// SELECT INDEX
// ========================================

function selectIndex(index) {
    if (index !== 'sensex' && index !== 'nifty' && index !== 'banknifty') {
        return;
    }
    
    currentIndex = index;
    
    // Update active state for index buttons
    document.querySelectorAll('[data-index]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.index === index);
    });
    
    // Fetch data
    fetchIndexData(currentIndex, currentPeriod);
}

// ========================================
// SELECT PERIOD
// ========================================

function selectPeriod(period) {
    if (!['1mo', '3mo', '6mo', '1y'].includes(period)) {
        return;
    }
    
    currentPeriod = period;
    
    // Update active state for period buttons
    document.querySelectorAll('[data-period]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });
    
    // Fetch data
    fetchIndexData(currentIndex, currentPeriod);
}

// ========================================
// FETCH INDEX DATA FROM API
// ========================================

async function fetchIndexData(index, period) {
    try {
        const idToken = localStorage.getItem('idToken');
        const headers = { 'Content-Type': 'application/json' };
        if (idToken) {
            headers['Authorization'] = idToken;
        }
        
        const url = `${API_BASE}/api/index-history?index=${index}&period=${period}`;
        const response = await fetch(url, { method: 'GET', headers });
        
        if (response.status === 401) {
            clearAuthAndRedirect('Session expired. Please login again.');
            return;
        }
        
        if (!response.ok) {
            showNotification('Failed to load market data', 'error');
            return;
        }
        
        const data = await response.json();
        if (data.success) {
            marketData = {
                dates: data.dates,
                close: data.close,
                volume: data.volume,
                ma50: data.ma50
            };
            
            updateMarketCards();
            updateChart();
            updateStats();
        } else {
            showNotification('Error: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        showNotification('Error loading market data: ' + error.message, 'error');
    }
}

// ========================================
// UPDATE MARKET CARDS
// ========================================

function updateMarketCards() {
    if (!marketData.close || marketData.close.length === 0) {
        return;
    }
    
    const latestPrice = marketData.close[marketData.close.length - 1];
    const previousPrice = marketData.close[Math.max(0, marketData.close.length - 2)];
    const change = latestPrice - previousPrice;
    const changePercent = previousPrice > 0 ? (change / previousPrice) * 100 : 0;
    const isPositive = changePercent >= 0;
    
    // Update price card
    const priceEl = document.getElementById(`${currentIndex}-price`);
    if (priceEl) {
        priceEl.textContent = '₹ ' + latestPrice.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    
    // Update change card
    const changeEl = document.getElementById(`${currentIndex}-change`);
    if (changeEl) {
        changeEl.className = `market-change ${isPositive ? 'positive' : 'negative'}`;
        const icon = isPositive ? '↑' : '↓';
        changeEl.textContent = `${icon} ${Math.abs(changePercent).toFixed(2)}%`;
    }
}

// ========================================
// UPDATE CHART WITH DUAL Y-AXIS
// ========================================

function updateChart() {
    if (!marketData.dates || !marketData.close || marketData.close.length === 0) {
        return;
    }
    
    const canvas = document.getElementById('marketChart');
    if (!canvas) {
        return;
    }
    
    // Destroy existing chart instance
    if (marketChart !== null && marketChart !== undefined) {
        marketChart.destroy();
        marketChart = null;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return;
    }
    
    // Calculate dynamic price axis bounds
    const closeData = marketData.close.filter(v => v !== null && !isNaN(v));
    const minPrice = Math.min(...closeData);
    const maxPrice = Math.max(...closeData);
    const priceRange = maxPrice - minPrice;
    const pricePadding = priceRange > 0 ? priceRange * 0.05 : Math.abs(minPrice) * 0.1;
    
    const suggestedMin = Math.max(0, minPrice - pricePadding);
    const suggestedMax = maxPrice + pricePadding;
    
    // Calculate volume axis bounds
    const volumeData = marketData.volume.filter(v => v !== null && !isNaN(v));
    const maxVolume = volumeData.length > 0 ? Math.max(...volumeData) : 1;
    
    const title = indexNames[currentIndex] + ' Index Performance';
    
    marketChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: marketData.dates,
            datasets: [
                {
                    label: 'Volume',
                    data: marketData.volume,
                    type: 'bar',
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(107, 114, 128, 0.2)',
                    borderWidth: 0,
                    barThickness: 'flex',
                    maxBarThickness: 5,
                    yAxisID: 'y1',
                    order: 2
                },
                {
                    label: 'Close Price',
                    data: marketData.close,
                    type: 'line',
                    borderColor: '#3b82f6',
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    pointRadius: 0,
                    pointHoverRadius: 8,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#1f2937',
                    pointBorderWidth: 2,
                    tension: 0,
                    fill: false,
                    yAxisID: 'y',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: undefined,
            interaction: {
                mode: 'index',
                intersect: false
            },
            layout: {
                padding: {
                    top: 25,
                    bottom: 15,
                    left: 0,
                    right: 0
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'center',
                    labels: {
                        color: '#e5e7eb',
                        font: {
                            size: 13,
                            weight: '600',
                            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
                        },
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxHeight: 5,
                        boxWidth: 5
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(17, 24, 39, 0.98)',
                    titleColor: '#f3f4f6',
                    bodyColor: '#e5e7eb',
                    padding: 14,
                    displayColors: true,
                    borderColor: '#4b5563',
                    borderWidth: 1,
                    cornerRadius: 8,
                    usePointStyle: true,
                    titleFont: {
                        size: 13,
                        weight: '600'
                    },
                    bodyFont: {
                        size: 12,
                        weight: '500'
                    },
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.yAxisID === 'y1') {
                                const value = context.raw;
                                if (value === null || value === undefined) return '';
                                if (value >= 1000000) {
                                    return context.dataset.label + ': ' + (value / 1000000).toFixed(2) + 'M';
                                } else if (value >= 1000) {
                                    return context.dataset.label + ': ' + (value / 1000).toFixed(2) + 'K';
                                }
                                return context.dataset.label + ': ' + value.toLocaleString('en-IN');
                            } else {
                                const value = context.raw;
                                if (value === null || value === undefined) return '';
                                return context.dataset.label + ': ₹ ' + value.toLocaleString('en-IN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                });
                            }
                        }
                    }
                },
                title: {
                    display: true,
                    text: title,
                    color: '#f3f4f6',
                    font: {
                        size: 16,
                        weight: '700',
                        family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
                    },
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Price (₹)',
                        color: '#d1d5db',
                        font: {
                            size: 12,
                            weight: '600'
                        },
                        padding: {
                            bottom: 10
                        }
                    },
                    min: suggestedMin,
                    max: suggestedMax,
                    grid: {
                        display: true,
                        color: 'rgba(75, 85, 99, 0.12)',
                        drawBorder: false,
                        drawTicks: false,
                        lineWidth: 1
                    },
                    ticks: {
                        callback: function(value) {
                            return '₹ ' + value.toLocaleString('en-IN', {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0
                            });
                        },
                        color: '#9ca3af',
                        font: {
                            size: 11,
                            weight: '500'
                        },
                        padding: 10,
                        maxTicksLimit: 8
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    max: maxVolume > 0 ? maxVolume * 1.2 : 1,
                    title: {
                        display: true,
                        text: 'Volume',
                        color: '#d1d5db',
                        font: {
                            size: 12,
                            weight: '600'
                        },
                        padding: {
                            bottom: 10
                        }
                    },
                    grid: {
                        display: false,
                        drawOnChartArea: false,
                        drawBorder: false,
                        drawTicks: false
                    },
                    ticks: {
                        callback: function(value) {
                            if (value === 0) return '0';
                            if (value >= 1000000) {
                                return (value / 1000000).toFixed(1) + 'M';
                            } else if (value >= 1000) {
                                return (value / 1000).toFixed(1) + 'K';
                            }
                            return value.toString();
                        },
                        color: '#9ca3af',
                        font: {
                            size: 11,
                            weight: '500'
                        },
                        padding: 10,
                        maxTicksLimit: 6
                    }
                },
                x: {
                    display: true,
                    grid: {
                        display: false,
                        drawBorder: false,
                        drawTicks: false
                    },
                    ticks: {
                        color: '#9ca3af',
                        font: {
                            size: 10,
                            weight: '500'
                        },
                        maxTicksLimit: 12,
                        padding: 10
                    }
                }
            }
        }
    });
}

// ========================================
// UPDATE STATS
// ========================================

function updateStats() {
    if (!marketData.close || marketData.close.length === 0) {
        return;
    }
    
    const close = marketData.close;
    const high = Math.max(...close);
    const low = Math.min(...close);
    const avg = close.reduce((a, b) => a + b, 0) / close.length;
    const days = marketData.dates.length;
    
    const highEl = document.getElementById('market-high');
    if (highEl) {
        highEl.textContent = '₹ ' + high.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    
    const lowEl = document.getElementById('market-low');
    if (lowEl) {
        lowEl.textContent = '₹ ' + low.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    
    const avgEl = document.getElementById('market-avg');
    if (avgEl) {
        avgEl.textContent = '₹ ' + avg.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    
    const pointsEl = document.getElementById('market-points');
    if (pointsEl) {
        pointsEl.textContent = days + ' days';
    }
}

// ========================================
// REFRESH DATA
// ========================================

function refreshMarketData() {
    fetchIndexData(currentIndex, currentPeriod);
    showNotification('Market data refreshed', 'success');
}

// ========================================
// LOGOUT
// ========================================

async function logout() {
    try {
        const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
        localStorage.removeItem('idToken');
        localStorage.removeItem('userEmail');
        window.location.href = '/login';
    } catch (error) {
        localStorage.removeItem('idToken');
        localStorage.removeItem('userEmail');
        window.location.href = '/login';
    }
}

// ========================================
// UTILITIES
// ========================================

function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function clearAuthAndRedirect(message) {
    localStorage.removeItem('idToken');
    localStorage.removeItem('userEmail');
    showNotification(message, 'error');
    setTimeout(() => {
        window.location.href = '/login';
    }, 1500);
}

