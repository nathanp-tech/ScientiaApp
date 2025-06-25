// static/js/dashboard.js
document.addEventListener('DOMContentLoaded', function() {
    // Element definitions from the HTML
    const ctx = document.getElementById('statsChart').getContext('2d');
    const apiUrl = '/dashboard/api/chart-data/';
    const recipesBtn = document.getElementById('show-recipes-btn');
    const slidesBtn = document.getElementById('show-slides-btn');
    const breadcrumbsEl = document.getElementById('chart-breadcrumbs');
    
    // Filter elements
    const statusFilter = document.getElementById('status-filter');
    const curriculumFilter = document.getElementById('curriculum-filter');
    const languageFilter = document.getElementById('language-filter');

    let myChart;
    // The central state object for the chart, now with new filters
    let chartState = {
        model: 'recipe',
        status: 'ALL',
        curriculum: 'ALL',
        language: 'ALL',
        drilldownStack: []
    };

    // --- ENHANCED CHART DESIGN ---
    const chartColors = {
        primary: '#123456',
        secondary: '#45b7d1',
        gridLines: 'rgba(0, 0, 0, 0.08)',
        tooltipBg: '#050350',
        font: '#343a40'
    };
    const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    gradient.addColorStop(0, chartColors.secondary);
    gradient.addColorStop(1, chartColors.primary);

    const chartConfig = {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Count',
                data: [],
                backgroundColor: gradient,
                borderColor: chartColors.primary,
                borderWidth: 1,
                borderRadius: 4,
                hoverBackgroundColor: chartColors.secondary,
                ids: [], 
                counts: [] // Custom property to store counts for tooltips
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            animation: {
                duration: 800,
                easing: 'easeInOutQuart'
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        color: chartColors.font,
                        callback: value => value
                    },
                    grid: { color: chartColors.gridLines },
                    max: undefined
                },
                y: {
                    ticks: { color: chartColors.font },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: '',
                    font: { size: 18, family: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
                    color: chartColors.font
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: chartColors.tooltipBg,
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    padding: 10,
                    cornerRadius: 5,
                    displayColors: false,
                    callbacks: {}
                }
            },
            onClick: handleChartClick
        }
    };

    /**
     * Fetches data from the API and updates the chart.
     */
    async function updateChart() {
        const currentLevel = chartState.drilldownStack[chartState.drilldownStack.length - 1];
        if (!currentLevel) return;

        // Add all filter states to the API request
        const params = new URLSearchParams({
            model: chartState.model,
            status: chartState.status,
            curriculum: chartState.curriculum,
            language: chartState.language,
            ...currentLevel.apiParams
        });

        try {
            const response = await fetch(`${apiUrl}?${params.toString()}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch chart data');
            }
            const result = await response.json();
            
            if (!myChart) myChart = new Chart(ctx, chartConfig);
            
            // Configure chart based on data type from API
            if (result.dataType === 'percentage_and_count') {
                myChart.options.scales.x.max = 100;
                myChart.options.scales.x.ticks.callback = value => value + '%';
                myChart.config.data.datasets[0].counts = result.counts; // Store counts for tooltip
                myChart.options.plugins.tooltip.callbacks.label = (context) => {
                    const count = context.chart.data.datasets[0].counts[context.dataIndex];
                    const countLabel = count === 1 ? '1 recipe' : `${count} recipes`;
                    return `Completion: ${context.parsed.x.toFixed(1)}% (${countLabel})`;
                };
                myChart.config.data.datasets[0].label = 'Completion';
                currentLevel.title = `Recipe Completion Rate by Subject`;
            } else { // Default to 'count'
                myChart.options.scales.x.max = undefined;
                myChart.options.scales.x.ticks.callback = value => Number.isInteger(value) ? value : null;
                myChart.options.plugins.tooltip.callbacks.label = (context) => `Total: ${context.parsed.x}`;
                myChart.config.data.datasets[0].label = 'Count';
            }

            // Update chart data
            myChart.config.data.datasets[0].ids = result.ids;
            myChart.data.labels = result.labels;
            myChart.data.datasets[0].data = result.data;
            myChart.options.plugins.title.text = currentLevel.title;
            
            myChart.update();
            updateBreadcrumbs();
        } catch (error) {
            console.error(error);
            breadcrumbsEl.innerHTML = `<span class="text-danger">Error: ${error.message}</span>`;
        }
    }

    /**
     * Handles clicks on chart bars to drill down into the data.
     * Drilldown is disabled for the main percentage view.
     */
    function handleChartClick(event) {
        if (myChart.config.data.datasets[0].label === 'Completion') {
            return;
        }

        const points = myChart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
        if (points.length === 0) return;

        const index = points[0].index;
        const clickedId = myChart.config.data.datasets[0].ids[index];
        const currentLevel = chartState.drilldownStack[chartState.drilldownStack.length - 1];
        const modelName = chartState.model.charAt(0).toUpperCase() + chartState.model.slice(1);
        const clickedLabel = myChart.data.labels[index];

        if (currentLevel.apiParams.group_by === 'subject') {
            chartState.drilldownStack.push({
                label: clickedId,
                title: `${modelName}s in ${clickedId} by Topic`,
                apiParams: { group_by: 'topic', subject_name: clickedId }
            });
            updateChart();
        } else if (currentLevel.apiParams.group_by === 'topic') {
            const shortLabel = clickedLabel.split(':').slice(1).join(':').trim();
            chartState.drilldownStack.push({
                label: shortLabel.substring(0, 20) + (shortLabel.length > 20 ? '...' : ''),
                title: `Sub-topics for ${shortLabel}`,
                apiParams: { ...currentLevel.apiParams, topic_id: clickedId }
            });
            updateChart();
        }
    }

    /**
     * Resets the view to the top-level subjects, applying current filters.
     */
    function resetToTopLevel() {
        const modelName = chartState.model.charAt(0).toUpperCase() + chartState.model.slice(1);
        let title;

        if (chartState.model === 'recipe') {
             title = `Recipe Completion Rate by Subject`;
        } else {
             title = `Count of ${modelName}s by Subject`;
        }

        chartState.drilldownStack = [{
            label: 'Subjects',
            title: title,
            apiParams: { group_by: 'subject' }
        }];
        updateChart();
    }

    /**
     * Updates the breadcrumb navigation.
     */
    function updateBreadcrumbs() {
        breadcrumbsEl.innerHTML = '';
        chartState.drilldownStack.forEach((level, index) => {
            const isLast = index === chartState.drilldownStack.length - 1;
            const breadcrumb = document.createElement(isLast ? 'span' : 'a');
            breadcrumb.href = '#';
            breadcrumb.className = isLast ? 'fw-bold text-dark' : 'text-primary';
            breadcrumb.textContent = level.label;
            if (!isLast) {
                breadcrumb.addEventListener('click', (e) => {
                    e.preventDefault();
                    chartState.drilldownStack = chartState.drilldownStack.slice(0, index + 1);
                    updateChart();
                });
            }
            breadcrumbsEl.appendChild(breadcrumb);
            if (!isLast) breadcrumbsEl.append(' / ');
        });
    }

    /**
     * Sets the active model (Recipes or Slideshows) and refreshes the chart.
     */
    function setActiveModel(model) {
        if (chartState.model === model && myChart) return;
        chartState.model = model;

        recipesBtn.classList.toggle('btn-primary', model === 'recipe');
        recipesBtn.classList.toggle('btn-outline-primary', model !== 'recipe');
        slidesBtn.classList.toggle('btn-primary', model === 'slide');
        slidesBtn.classList.toggle('btn-outline-primary', model !== 'slide');
        
        resetToTopLevel();
    }

    // --- Event Listeners for all filters ---
    recipesBtn.addEventListener('click', () => setActiveModel('recipe'));
    slidesBtn.addEventListener('click', () => setActiveModel('slide'));
    
    // Function to handle any filter change
    function handleFilterChange() {
        chartState.status = statusFilter.value;
        chartState.curriculum = curriculumFilter.value;
        chartState.language = languageFilter.value;
        resetToTopLevel();
    }

    statusFilter.addEventListener('change', handleFilterChange);
    curriculumFilter.addEventListener('change', handleFilterChange);
    languageFilter.addEventListener('change', handleFilterChange);

    // --- Initial Load ---
    setActiveModel('recipe');
});
